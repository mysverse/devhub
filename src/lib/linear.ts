import { LinearClient } from "@linear/sdk";
import prisma from "./prisma";

export class LinearReauthRequiredError extends Error {
  constructor(message = "Linear reauthentication required") {
    super(message);
    this.name = "LinearReauthRequiredError";
  }
}

async function refreshLinearToken(
  accountId: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.LINEAR_CLIENT_ID ?? "",
        client_secret: process.env.LINEAR_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error("Linear token refresh failed:", response.status);
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: data.access_token,
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
        ...(expiresAt && { accessTokenExpiresAt: expiresAt }),
      },
    });

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Linear token:", error);
    return null;
  }
}

async function getValidLinearToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "linear" },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  });

  // No Linear account linked at all
  if (!account) return null;

  // Account exists but token is missing — needs reauth
  if (!account.accessToken) {
    if (!account.refreshToken) {
      throw new LinearReauthRequiredError();
    }
    // Try refreshing
    const newToken = await refreshLinearToken(account.id, account.refreshToken);
    if (!newToken) {
      throw new LinearReauthRequiredError();
    }
    return newToken;
  }

  // Check if token is expired (with 5-minute buffer)
  const isExpired =
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired) {
    if (!account.refreshToken) {
      throw new LinearReauthRequiredError();
    }
    const newToken = await refreshLinearToken(account.id, account.refreshToken);
    if (!newToken) {
      throw new LinearReauthRequiredError();
    }
    return newToken;
  }

  return account.accessToken;
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("authentication required") ||
      msg.includes("not authenticated") ||
      msg.includes("unauthorized") ||
      msg.includes("invalid token")
    );
  }
  return false;
}

export async function getLinearToken(userId: string): Promise<string | null> {
  return getValidLinearToken(userId);
}

export async function getLinearClient(userId: string) {
  const token = await getValidLinearToken(userId);

  if (token) {
    return new LinearClient({ accessToken: token });
  }

  // No Linear account linked — user needs to authenticate
  throw new LinearReauthRequiredError();
}

/**
 * Executes a Linear API call with the user's OAuth token.
 * If the token is invalid/revoked at runtime, invalidates it and throws
 * LinearReauthRequiredError to trigger reauthentication.
 */
export async function withLinearFallback<T>(
  userId: string,
  fn: (client: LinearClient) => Promise<T>,
): Promise<T> {
  const client = await getLinearClient(userId);

  try {
    return await fn(client);
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      throw error;
    }
    if (isAuthError(error)) {
      // Invalidate the stored token so reauth is triggered
      await prisma.account.updateMany({
        where: { userId, providerId: "linear" },
        data: { accessToken: null },
      });
      throw new LinearReauthRequiredError();
    }
    throw error;
  }
}
