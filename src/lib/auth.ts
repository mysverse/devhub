import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { syncUserAccess } from "./access-sync";
import { isDevMode } from "./dev-mode";
import prisma from "./prisma";

/**
 * Providers that may only ever be *linked* to an existing DevHub account,
 * never used to authenticate one. Linear is the account's anchor identity.
 */
const LINK_ONLY_PROVIDERS = new Set(["discord", "roblox"]);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // Dev mode only: lets the seed script create persona users and the
  // /api/dev/login route sign them in without OAuth. Disabled in real envs.
  emailAndPassword: {
    enabled: isDevMode(),
  },
  // Discord, Roblox, and Linear are independent identity providers with
  // unrelated emails (Linear's is the only one DevHub actually cares
  // about). Without this, linking a second/third provider to an existing
  // account fails with email_doesn't_match as soon as the emails differ.
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
  hooks: {
    // Linear is the sole authenticator; Discord and Roblox are attribute
    // links only (see LINK_ONLY_PROVIDERS). POST /sign-in/oauth2 is public
    // and unauthenticated, and better-auth resolves an existing account by
    // (providerId, accountId) before it ever looks at email — so without
    // this guard a stolen Discord/Roblox account would mint a full DevHub
    // session as that user, and any Discord/Roblox identity could
    // self-register. Reject those providers on the sign-in route; /oauth2/link
    // (session-gated) is unaffected.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/oauth2") return;
      const providerId = (ctx.body as { providerId?: string } | undefined)
        ?.providerId;
      if (providerId && LINK_ONLY_PROVIDERS.has(providerId)) {
        throw new APIError("BAD_REQUEST", {
          message: `${providerId} cannot be used to sign in. Sign in with Linear, then link it from settings.`,
        });
      }
    }),
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          const { providerId, accountId, userId } = account;
          if (providerId === "discord") {
            await prisma.userProfile.updateMany({
              where: { id: userId },
              data: { discordId: accountId },
            });
            await syncLinkedAccess(userId);
          } else if (providerId === "roblox") {
            await prisma.userProfile.updateMany({
              where: { id: userId },
              data: { robloxId: accountId, robuxUsername: null },
            });
            await syncLinkedAccess(userId);
          } else if (providerId === "linear") {
            await prisma.userProfile.updateMany({
              where: { id: userId },
              data: { linearId: accountId },
            });
          }
        },
      },
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "linear",
          clientId: process.env.LINEAR_CLIENT_ID ?? "",
          clientSecret: process.env.LINEAR_CLIENT_SECRET ?? "",
          authorizationUrl: "https://linear.app/oauth/authorize",
          tokenUrl: "https://api.linear.app/oauth/token",
          scopes: ["read", "write", "issues:create"],
          getUserInfo: async (tokens) => {
            const response = await fetch("https://api.linear.app/graphql", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokens.accessToken}`,
              },
              body: JSON.stringify({
                query: "{ viewer { id name email avatarUrl } }",
              }),
            });
            const { data } = (await response.json()) as {
              data: {
                viewer: {
                  id: string;
                  name: string;
                  email: string;
                  avatarUrl: string | null;
                };
              };
            };
            return {
              id: data.viewer.id,
              name: data.viewer.name,
              email: data.viewer.email,
              emailVerified: true,
              image: data.viewer.avatarUrl ?? undefined,
            };
          },
        },
        {
          providerId: "discord",
          clientId: process.env.DISCORD_CLIENT_ID ?? "",
          clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
          authorizationUrl: "https://discord.com/oauth2/authorize",
          tokenUrl: "https://discord.com/api/oauth2/token",
          scopes: ["identify"],
          getUserInfo: async (tokens) => {
            const response = await fetch("https://discord.com/api/users/@me", {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            });
            const data = (await response.json()) as {
              id: string;
              username: string;
              avatar: string | null;
            };
            return {
              id: data.id,
              name: data.username,
              // DevHub only stores discordId, never an email, from this
              // provider. better-auth still requires *a* value here, so
              // this is a stable, non-real placeholder rather than
              // requesting the email scope from Discord for no reason.
              email: `discord-${data.id}@oauth.devhub.mysver.se`,
              emailVerified: false,
              image: data.avatar
                ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
                : undefined,
            };
          },
        },
        {
          providerId: "roblox",
          clientId: process.env.ROBLOX_CLIENT_ID ?? "",
          clientSecret: process.env.ROBLOX_CLIENT_SECRET ?? "",
          authorizationUrl: "https://apis.roblox.com/oauth/v1/authorize",
          tokenUrl: "https://apis.roblox.com/oauth/v1/token",
          scopes: ["openid", "profile"],
          pkce: true,
          getUserInfo: async (tokens) => {
            const response = await fetch(
              "https://apis.roblox.com/oauth/v1/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              },
            );
            const data = (await response.json()) as {
              sub: string;
              preferred_username: string;
              nickname: string;
              picture: string | null;
            };
            return {
              id: data.sub,
              name: data.preferred_username || data.nickname,
              // DevHub only stores robloxId, never an email, from this
              // provider — see the matching Discord comment above. Also
              // sidesteps Roblox accounts with no verified email on file.
              email: `roblox-${data.sub}@oauth.devhub.mysver.se`,
              emailVerified: false,
              image: data.picture ?? undefined,
            };
          },
        },
      ],
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});

export type Session = typeof auth.$Infer.Session;

async function syncLinkedAccess(userId: string) {
  try {
    await syncUserAccess(userId, null);
  } catch (error) {
    console.error("[access-sync] linked account sync failed:", error);
  }
}
