import { cache } from "react";
import prisma from "@/lib/prisma";
import { withIdempotentWrite } from "@/lib/prisma-retry";

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
    // Runs on /dashboard and /dashboard/ppts, so a transient failure here is a
    // blank page on the two pages people open most. The upsert keys on the
    // primary key with an empty update, so repeating it is a no-op.
    let userProfile = await withIdempotentWrite(
      "unique-keyed-upsert",
      "ensureUserProfile",
      () =>
        prisma.userProfile.upsert({
          where: { id: userId },
          update: {},
          create: {
            id: userId,
            // The OAuth provider name is a handle, not a legal name — it seeds
            // the display identity. legalName stays empty until the user
            // supplies it in onboarding, so the column only ever holds a real
            // legal name.
            preferredName: name ?? null,
          },
        }),
    );

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
