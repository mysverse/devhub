'use server'

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

export async function generateInviteLink() {
  const { userId } = await auth();
  
  if (!userId) {
    return { error: "Unauthorized" };
  }

  // Ideally, you'd check if the user is an admin here before allowing generation
  // For now, we allow any logged-in user to generate for demonstration.

  const token = crypto.randomBytes(32).toString('hex');

  try {
    const invite = await prisma.invite.create({
      data: {
        token,
        creatorId: userId
      }
    });

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite?token=${token}`;
    return { success: true, url: inviteUrl };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to generate invite" };
  }
}