import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import prisma from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
