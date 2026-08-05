import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

export type UserContact = { email: string; name: string };

/**
 * Resolves the address and greeting name for a transactional email.
 *
 * Server-internal helper. This deliberately lives OUTSIDE any `"use server"`
 * module: every export of such a module is compiled into a publicly callable
 * Server Action endpoint, and this one takes an arbitrary userId and returns
 * that user's email. Never re-export it from an `actions.ts`.
 */
export async function getUserEmailAndName(
  userId: string,
): Promise<UserContact> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { user: { select: USER_IDENTITY_SELECT } },
  });

  if (!profile?.user.email) {
    throw new Error("User email not found");
  }

  return { email: profile.user.email, name: profile.user.name };
}
