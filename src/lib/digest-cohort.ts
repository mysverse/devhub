// How far a developer got before stalling, which decides what the weekly
// re-engagement email should say to them. Pure and Prisma-free so the
// branching is unit-testable — the digest itself is a DB path verified by
// `pnpm simulate cron ppt-open-tasks-digest`.
//
// The audience this splits used to be gated on prior activity: a developer
// needed an existing assignment watch or transaction to qualify at all. That
// excluded, by construction, the people the email exists to reach.

export type DigestCohort =
  /** Account exists but Linear isn't connected — claiming isn't possible yet. */
  | "unlinked"
  /** Onboarded, never claimed or earned anything. The activation target. */
  | "never-activated"
  /** Was active once, nothing recent. */
  | "lapsed"
  /** Active recently, just carrying no task right now. */
  | "idle";

export type DigestCandidate = {
  hasLinearId: boolean;
  accountCreatedAt: Date;
  lastWatchAt: Date | null;
  lastTransactionAt: Date | null;
};

export type DigestWindows = {
  /** Activity older than this counts as lapsed. */
  activityCutoff: Date;
  /** Accounts newer than this are still in their onboarding grace period. */
  onboardingCutoff: Date;
};

/**
 * Returns the cohort, or null when this developer should be left alone this
 * week. Null is only ever returned for someone still inside the onboarding
 * grace period — everyone else gets a message suited to where they are.
 */
export function classifyDigestCohort(
  candidate: DigestCandidate,
  windows: DigestWindows,
): DigestCohort | null {
  if (!candidate.hasLinearId) return "unlinked";

  const lastActivityAt = [candidate.lastWatchAt, candidate.lastTransactionAt]
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!lastActivityAt) {
    // Brand new: still working through onboarding, don't chase them yet.
    if (candidate.accountCreatedAt > windows.onboardingCutoff) return null;
    return "never-activated";
  }

  return lastActivityAt < windows.activityCutoff ? "lapsed" : "idle";
}
