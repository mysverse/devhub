import type { IssueDTO } from "@/lib/linear-queries";
import prisma from "@/lib/prisma";
import {
  EMPTY_HISTORY,
  inferTaskSpecialties,
  type RankedTask,
  type RecommendationHistory,
  rankTasksForDeveloper,
} from "@/lib/task-recommendation";

// Assembles the inputs the pure ranker needs. Kept out of
// task-recommendation.ts so the scoring stays unit-testable in a repo with no
// Prisma mocking — same split as payout-campaign.ts / -server.ts.

/** How many past payouts to read when working out what someone usually takes on. */
const HISTORY_LOOKBACK = 20;

/**
 * What this developer has actually finished, used to size and theme their
 * recommendations. Returns EMPTY_HISTORY for someone who has never been paid —
 * which is the population these recommendations exist for, so that path has to
 * produce sensible output rather than nothing.
 */
export async function getRecommendationHistory(
  userId: string,
): Promise<RecommendationHistory> {
  const paid = await prisma.pptPayoutState.findMany({
    where: { userId, status: "PAID" },
    orderBy: { updatedAt: "desc" },
    take: HISTORY_LOOKBACK,
    select: { linearIssueTitle: true, estimate: true },
  });
  if (paid.length === 0) return EMPTY_HISTORY;

  const completedEstimates: number[] = [];
  const completedSpecialties = new Set<
    RecommendationHistory["completedSpecialties"][number]
  >();

  for (const state of paid) {
    if (state.estimate != null) completedEstimates.push(state.estimate);
    // Payout state keeps the issue title but not its labels, so past work is
    // themed from the title alone.
    const inferred = inferTaskSpecialties({
      id: "",
      identifier: "",
      title: state.linearIssueTitle ?? "",
      description: null,
      estimate: state.estimate,
      labelNames: [],
    });
    for (const specialty of [...inferred.fromLabels, ...inferred.fromTitle]) {
      completedSpecialties.add(specialty);
    }
  }

  return {
    completedEstimates,
    completedSpecialties: [...completedSpecialties],
  };
}

/**
 * Rank open PPTs for one developer. Used by the dashboard, the board, and the
 * weekly digest so the email and the app never disagree about what to do next.
 */
export async function rankPptsForUser(
  userId: string,
  issues: IssueDTO[],
): Promise<RankedTask[]> {
  const [profile, history] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { specialties: true, developerRank: true },
    }),
    getRecommendationHistory(userId),
  ]);

  return rankTasksForDeveloper(
    issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      estimate: issue.estimate,
      labelNames: issue.labelNames,
    })),
    {
      specialties: profile?.specialties ?? [],
      developerRank: profile?.developerRank ?? "DEVELOPER",
    },
    history,
  );
}
