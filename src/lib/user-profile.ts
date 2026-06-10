import { cache } from "react";
import prisma from "@/lib/prisma";

export const getUserProfile = cache(async (userId: string) => {
  return prisma.userProfile.findUnique({
    where: { id: userId },
  });
});

export const ensureUserProfile = cache(
  async ({
    userId,
    name,
    email,
  }: {
    userId: string;
    name?: string | null;
    email?: string | null;
  }) => {
    let userProfile = await prisma.userProfile.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        legalName: name ?? null,
      },
    });

    if (!userProfile.linearId) {
      const linearAccount = await prisma.account.findFirst({
        where: { userId, providerId: "linear" },
        select: { accountId: true },
      });

      if (linearAccount) {
        userProfile = await prisma.userProfile.update({
          where: { id: userId },
          data: {
            linearId: linearAccount.accountId,
            linearEmail: email ?? null,
          },
        });
      }
    }

    return userProfile;
  },
);
