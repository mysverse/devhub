import prisma from "@/lib/prisma";

// Suggestion bookkeeping that runs inside other flows (claiming a task), as
// opposed to the admin-triggered actions in
// app/dashboard/admin/task-suggestion-actions.ts. Deliberately NOT a
// "use server" module: nothing here is a public endpoint, and it has no
// business being callable from a browser.

/**
 * Close out suggestions for a task once it's claimed — CLAIMED when the
 * person we nudged took it, TAKEN when somebody else did. This is the only
 * signal for whether pushing work at people actually works.
 *
 * Never throws: a bookkeeping failure must not fail a claim.
 */
export async function resolveTaskSuggestions(
  linearIssueId: string,
  claimedByUserId: string,
) {
  try {
    const respondedAt = new Date();
    await prisma.taskSuggestion.updateMany({
      where: { linearIssueId, userId: claimedByUserId, outcome: "PENDING" },
      data: { outcome: "CLAIMED", respondedAt },
    });
    await prisma.taskSuggestion.updateMany({
      where: {
        linearIssueId,
        userId: { not: claimedByUserId },
        outcome: "PENDING",
      },
      data: { outcome: "TAKEN", respondedAt },
    });
  } catch (error) {
    console.warn(
      "[task-suggestion] could not resolve suggestions for",
      linearIssueId,
      error instanceof Error ? error.message : error,
    );
  }
}
