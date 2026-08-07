import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import { syncUserAccess } from "./access-sync";
import { isDevMode } from "./dev-mode";
import prisma from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // Dev mode only: lets the seed script create persona users and the
  // /api/dev/login route sign them in without OAuth. Disabled in real envs.
  emailAndPassword: {
    enabled: isDevMode(),
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
          scopes: ["identify", "email"],
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
              email: string | null;
              verified: boolean;
            };
            return {
              id: data.id,
              name: data.username,
              email: data.email ?? undefined,
              emailVerified: data.verified ?? false,
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
