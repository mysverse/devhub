"use server";

import { revalidatePath } from "next/cache";
import { revokeLinkedAccountAccess } from "@/lib/access-sync";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

function isSafeRevocationSkip(action: string) {
  return action.includes("user is not in") || action.includes("no mapped");
}

export async function unlinkAccount(providerId: "discord" | "roblox") {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  const account = await prisma.account.findFirst({
    where: { userId, providerId },
    select: { accountId: true },
  });
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      paymentMethod: true,
      discordId: true,
      robloxId: true,
    },
  });

  if (providerId === "roblox") {
    if (profile?.paymentMethod === "ROBUX") {
      return {
        error:
          "Change your payment method before disconnecting your Roblox account.",
      };
    }
  }

  const externalAccountId =
    account?.accountId ??
    (providerId === "discord" ? profile?.discordId : profile?.robloxId);

  if (externalAccountId) {
    try {
      const results = await revokeLinkedAccountAccess({
        userId,
        providerId,
        externalAccountId,
      });
      const incomplete = results.filter(
        (result) =>
          result.status === "FAILED" ||
          (result.status === "SKIPPED" && !isSafeRevocationSkip(result.action)),
      );
      if (incomplete.length) {
        return {
          error: `Could not revoke ${providerId} access before disconnecting. ${incomplete
            .map((result) => result.error || result.action)
            .join("; ")}`,
        };
      }
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : `Could not revoke ${providerId} access before disconnecting.`,
      };
    }
  }

  await prisma.account.deleteMany({
    where: { userId, providerId },
  });

  const profileData =
    providerId === "discord"
      ? { discordId: null }
      : { robloxId: null, robuxUsername: null };

  await prisma.userProfile.updateMany({
    where: { id: userId },
    data: profileData,
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
