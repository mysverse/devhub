import { createClerkClient } from "@clerk/nextjs/server";
import { LinearClient } from "@linear/sdk";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function getLinearToken(userId: string): Promise<string | null> {
  try {
    const oauthTokens = await clerkClient.users.getUserOauthAccessToken(
      userId,
      "linear",
    );
    return oauthTokens.data[0]?.token ?? null;
  } catch (error) {
    console.error("Error fetching Linear OAuth token:", error);
    return null;
  }
}

export async function getLinearClient(userId: string) {
  try {
    const oauthTokens = await clerkClient.users.getUserOauthAccessToken(
      userId,
      "linear",
    );

    const token = oauthTokens.data[0]?.token;

    if (!token) {
      // Fallback to system API key if available, or throw
      if (process.env.LINEAR_API_KEY) {
        return new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
      }
      throw new Error(
        "No Linear OAuth token found for user and no system API key configured.",
      );
    }

    return new LinearClient({ accessToken: token });
  } catch (error) {
    console.error("Error fetching Linear OAuth token:", error);
    if (process.env.LINEAR_API_KEY) {
      return new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
    }
    throw error;
  }
}
