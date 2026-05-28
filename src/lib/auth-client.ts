import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const _isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

const realClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

// Dev mode mock session data (inlined to avoid importing server-only mock-data)
const _mockSession = _isDevMode
  ? {
      data: {
        user: {
          id: "dev-user-001",
          name: "Alex Developer",
          email: "alex@mysverse.dev",
          emailVerified: true,
          image: null,
          createdAt: new Date("2024-06-01"),
          updatedAt: new Date("2025-05-20"),
        },
        session: {
          id: "dev-session-001",
          userId: "dev-user-001",
          token: "dev-token",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      isPending: false,
      error: null,
    }
  : null;

// biome-ignore lint/suspicious/noExplicitAny: dev mode no-op stubs
const _noopSignIn: any = _isDevMode
  ? Object.assign(() => Promise.resolve(), {
      oauth2: () => Promise.resolve(),
      social: () => Promise.resolve(),
    })
  : null;

// biome-ignore lint/suspicious/noExplicitAny: export dev mode stubs or real client
export const authClient: any = realClient;

// biome-ignore lint/suspicious/noExplicitAny: export dev mode stubs or real client
export const useSession: any = _isDevMode
  ? () => _mockSession
  : realClient.useSession;

// biome-ignore lint/suspicious/noExplicitAny: export dev mode stubs or real client
export const signIn: any = _isDevMode ? _noopSignIn : realClient.signIn;

// biome-ignore lint/suspicious/noExplicitAny: export dev mode stubs or real client
export const signOut: any = _isDevMode
  ? () => Promise.resolve()
  : realClient.signOut;
