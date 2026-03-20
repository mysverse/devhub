import { LinearClient } from "@linear/sdk";
import prisma from "./prisma";

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
  try {
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "linear" },
      select: {
        id: true,
        accessToken: true,
        refreshToken: true,
        accessTokenExpiresAt: true,
      },
    });

    if (!account?.accessToken) return null;

    // Check if token is expired (with 5-minute buffer)
    const isExpired =
      account.accessTokenExpiresAt &&
      account.accessTokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired && account.refreshToken) {
      const newToken = await refreshLinearToken(
        account.id,
        account.refreshToken,
      );
      return newToken;
    }

    return account.accessToken;
  } catch (error) {
    console.error("Error fetching Linear OAuth token:", error);
    return null;
  }
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

  if (process.env.LINEAR_API_KEY) {
    return new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
  }

  throw new Error(
    "No Linear OAuth token found and no system API key configured.",
  );
}

/**
 * Executes a Linear API call with automatic fallback to the system API key
 * if the user's token is invalid/revoked at runtime.
 */
export async function withLinearFallback<T>(
  userId: string,
  fn: (client: LinearClient) => Promise<T>,
): Promise<T> {
  const client = await getLinearClient(userId);

  try {
    return await fn(client);
  } catch (error) {
    if (isAuthError(error) && process.env.LINEAR_API_KEY) {
      console.warn(
        "Linear user token failed at runtime, falling back to system API key",
      );
      // Invalidate the stored token so it gets refreshed next time
      await prisma.account.updateMany({
        where: { userId, providerId: "linear" },
        data: { accessToken: null },
      });
      const fallbackClient = new LinearClient({
        apiKey: process.env.LINEAR_API_KEY,
      });
      return await fn(fallbackClient);
    }
    throw error;
  }
}
