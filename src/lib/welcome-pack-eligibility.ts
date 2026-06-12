import dayjs from "dayjs";
import {
  getLinearClient,
  LinearReauthRequiredError,
  withLinearFallback,
} from "@/lib/linear";
import prisma from "@/lib/prisma";

export type QualifyingLinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  completedAt: string; // ISO string
};

export type WelcomePackEligibility = {
  eligible: boolean;
  wave: 1 | 2 | null;
  reason?: string;
  needsLinearReauth?: boolean;
  /**
   * True when the Linear fetch errored (non-reauth) — wave-1 status is
   * unknown rather than negative, so callers should treat a "not eligible"
   * verdict as retryable instead of final.
   */
  checkFailed?: boolean;
  /**
   * For wave-1 hits, the recent qualifying issues we saw. Empty array when
   * the user qualifies via wave 2 or doesn't qualify at all.
   */
  wave1Evidence?: {
    qualifyingIssues: QualifyingLinearIssue[];
    lookbackMonths: number;
    /**
     * True when the count returned was capped — there may be more issues we
     * didn't fetch.
     */
    truncated: boolean;
  };
};

/** Captured at submission time and persisted on the order for audit. */
export type EligibilitySnapshot = {
  wave: 1 | 2;
  capturedAt: string;
  lookbackMonths: number;
  /** Wave 1: the issues we used as evidence. Empty for wave 2. */
  qualifyingIssues: QualifyingLinearIssue[];
  /** True when the qualifying issue list was capped. */
  truncated: boolean;
  /** Human-readable note on why the user qualifies. */
  note: string;
  /**
   * True when the Linear check errored at submission time — the wave-2
   * verdict may understate the user's actual wave-1 status.
   */
  linearCheckFailed?: boolean;
};

const WAVE_1_LOOKBACK_MONTHS = 6;
const WAVE_1_EVIDENCE_LIMIT = 10;

/**
 * Determine whether the user can place a welcome pack order.
 *
 * Wave 1: any Linear issue assigned to the user that completed within the
 *   last 6 months.
 * Wave 2: opened by the active WelcomePack having `wave2Open = true`. Anyone
 *   without a wave 1 hit who is otherwise authenticated qualifies for wave 2.
 *
 * If the user does not have a working Linear OAuth connection, we surface
 * `needsLinearReauth = true` so the page can prompt them to reconnect — at
 * least until wave 2 is open, in which case they qualify regardless.
 */
export async function checkWelcomePackEligibility(
  userId: string,
  /**
   * Pre-loaded `wave2Open` from the caller's `WelcomePack` query. Pass it
   * through to avoid re-querying Postgres just to read one boolean. Falls back
   * to a small `findFirst({ select: { wave2Open: true } })` only when omitted.
   */
  wave2Open?: boolean,
): Promise<WelcomePackEligibility> {
  let resolvedWave2Open = wave2Open;
  if (resolvedWave2Open === undefined) {
    const pack = await prisma.welcomePack.findFirst({
      where: { isActive: true },
      select: { wave2Open: true },
    });
    resolvedWave2Open = pack?.wave2Open ?? false;
  }

  // Try wave 1 first via Linear OAuth.
  let qualifyingIssues: QualifyingLinearIssue[] = [];
  let truncated = false;
  let needsLinearReauth = false;
  let checkFailed = false;

  try {
    const sixMonthsAgo = dayjs().subtract(WAVE_1_LOOKBACK_MONTHS, "month");
    const fetched = await withLinearFallback(userId, async (client) => {
      const viewer = await client.viewer;
      const result = await client.issues({
        first: WAVE_1_EVIDENCE_LIMIT,
        filter: {
          assignee: { id: { eq: viewer.id } },
          completedAt: { gte: sixMonthsAgo.toDate() },
        },
      });
      return {
        nodes: result.nodes,
        hasNextPage: result.pageInfo?.hasNextPage ?? false,
      };
    });
    qualifyingIssues = fetched.nodes.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      completedAt:
        (issue.completedAt instanceof Date
          ? issue.completedAt.toISOString()
          : (issue.completedAt as string | undefined)) ??
        new Date().toISOString(),
    }));
    truncated = fetched.hasNextPage;
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      needsLinearReauth = true;
    } else {
      checkFailed = true;
      console.error("[welcome-pack] Linear eligibility check failed:", error);
    }
  }

  if (qualifyingIssues.length > 0) {
    return {
      eligible: true,
      wave: 1,
      wave1Evidence: {
        qualifyingIssues,
        lookbackMonths: WAVE_1_LOOKBACK_MONTHS,
        truncated,
      },
    };
  }

  if (resolvedWave2Open) {
    return { eligible: true, wave: 2, checkFailed: checkFailed || undefined };
  }

  if (needsLinearReauth) {
    return {
      eligible: false,
      wave: null,
      needsLinearReauth: true,
      reason:
        "We couldn't verify your Linear activity. Reconnect Linear to check Wave 1 eligibility.",
    };
  }

  // A failed fetch is "unknown", not "ineligible" — surface a retryable
  // error instead of the not-eligible copy.
  if (checkFailed) {
    return {
      eligible: false,
      wave: null,
      checkFailed: true,
      reason:
        "We couldn't reach Linear to verify your eligibility. Please try again in a minute.",
    };
  }

  return {
    eligible: false,
    wave: null,
    reason:
      "Wave 1 is open to developers with a Linear issue completed in the last 6 months. Wave 2 isn't open right now.",
  };
}

/**
 * Lighter check used by the submit action — re-validates that the caller is
 * still eligible before creating an order. Throws on ineligibility so the
 * action can surface a clean error.
 */
export async function assertEligibleForWelcomePack(
  userId: string,
  wave2Open?: boolean,
): Promise<{ wave: 1 | 2; snapshot: EligibilitySnapshot }> {
  const result = await checkWelcomePackEligibility(userId, wave2Open);
  if (!result.eligible || result.wave === null) {
    throw new Error(result.reason ?? "Not eligible for the welcome pack");
  }

  const wave = result.wave;
  const snapshot: EligibilitySnapshot =
    wave === 1
      ? {
          wave: 1,
          capturedAt: new Date().toISOString(),
          lookbackMonths:
            result.wave1Evidence?.lookbackMonths ?? WAVE_1_LOOKBACK_MONTHS,
          qualifyingIssues: result.wave1Evidence?.qualifyingIssues ?? [],
          truncated: result.wave1Evidence?.truncated ?? false,
          note: `User had ${
            result.wave1Evidence?.qualifyingIssues.length ?? 0
          } completed Linear issue(s) in the last ${
            result.wave1Evidence?.lookbackMonths ?? WAVE_1_LOOKBACK_MONTHS
          } months${result.wave1Evidence?.truncated ? " (truncated)" : ""}.`,
        }
      : {
          wave: 2,
          capturedAt: new Date().toISOString(),
          lookbackMonths: WAVE_1_LOOKBACK_MONTHS,
          qualifyingIssues: [],
          truncated: false,
          note: result.checkFailed
            ? "Wave 2 was open at submission time. (Linear check failed — wave 1 status unknown.)"
            : "Wave 2 was open at submission time.",
          linearCheckFailed: result.checkFailed || undefined,
        };

  return { wave, snapshot };
}

// Re-export so callers don't have to also import from the linear lib for
// reauth handling.
export { getLinearClient, LinearReauthRequiredError };
