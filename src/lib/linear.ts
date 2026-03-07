import { LinearClient } from "@linear/sdk";
import prisma from "./prisma";

export async function getLinearToken(userId: string): Promise<string | null> {
  try {
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "linear" },
      select: { accessToken: true },
    });
    return account?.accessToken ?? null;
  } catch (error) {
    console.error("Error fetching Linear OAuth token:", error);
    return null;
  }
}

export async function getLinearClient(userId: string) {
  const token = await getLinearToken(userId);

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
