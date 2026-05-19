"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-utils";
import { syncBonusCandidateFromLinearSdkIssue } from "@/lib/bonus";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import prisma from "@/lib/prisma";

export async function refreshMyBonusCandidates() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { linearId: true },
  });

  if (!profile?.linearId) {
    return { error: "Connect Linear before refreshing bonuses." };
  }

  try {
    const count = await withLinearFallback(userId, async (client) => {
      const response = await client.issues({
        first: 100,
        filter: {
          assignee: { id: { eq: profile.linearId as string } },
        },
      });

      await Promise.all(
        response.nodes.map((issue) =>
          syncBonusCandidateFromLinearSdkIssue(issue),
        ),
      );

      return response.nodes.length;
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/bonuses");
    return { success: true, count };
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to refresh bonus candidates",
    };
  }
}
