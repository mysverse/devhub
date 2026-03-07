"use server";

import crypto from "node:crypto";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { getBaseUrl } from "@/lib/url";

export async function generateInviteLink(emailAddress: string) {
  const { userId } = await getSession();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (userProfile?.role !== "ADMIN") {
    return { error: "Forbidden: Only admins can invite users." };
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");

    await prisma.invite.create({
      data: { token, creatorId: userId },
    });

    const url = `${getBaseUrl()}/sign-in?invite=${token}`;

    return {
      success: true,
      url,
      message: `Invite link generated for ${emailAddress}!`,
    };
  } catch (error) {
    const err = error as Error;
    console.error("Invite generation error:", err);
    return { error: err.message || "Failed to generate invite" };
  }
}
