"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function unlinkAccount(providerId: "discord" | "roblox") {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  if (providerId === "roblox") {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { paymentMethod: true },
    });
    if (profile?.paymentMethod === "ROBUX") {
      return {
        error:
          "Change your payment method before disconnecting your Roblox account.",
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
