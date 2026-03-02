"use server";

import { auth, createClerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { getBaseUrl } from "@/lib/url";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function generateInviteLink(emailAddress: string) {
  const { userId } = await auth();

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
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: emailAddress,
      ignoreExisting: true, // Don't fail if they already exist, just return the existing invite
      notify: true, // Let Clerk send the email automatically
      redirectUrl: `${getBaseUrl()}/onboarding`,
    });

    return {
      success: true,
      url: invitation.url, // Clerk returns a pre-signed URL to bypass closed registrations
      message: `Invitation sent to ${emailAddress}!`,
    };
  } catch (error) {
    const err = error as Error;
    // Handle clerk specific error formats if needed
    console.error("Clerk Invitation Error:", err);
    return { error: err.message || "Failed to generate invite" };
  }
}
