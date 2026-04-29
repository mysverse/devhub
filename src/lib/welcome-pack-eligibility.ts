import dayjs from "dayjs";
import {
  getLinearClient,
  LinearReauthRequiredError,
  withLinearFallback,
} from "@/lib/linear";
import prisma from "@/lib/prisma";

export type WelcomePackEligibility = {
  eligible: boolean;
  wave: 1 | 2 | null;
  reason?: string;
  needsLinearReauth?: boolean;
};

const WAVE_1_LOOKBACK_MONTHS = 6;

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
): Promise<WelcomePackEligibility> {
  const pack = await prisma.welcomePack.findFirst({
    where: { isActive: true },
    select: { wave2Open: true },
  });

  // Try wave 1 first via Linear OAuth.
  let wave1Hit = false;
  let needsLinearReauth = false;

  try {
    const sixMonthsAgo = dayjs().subtract(WAVE_1_LOOKBACK_MONTHS, "month");
    wave1Hit = await withLinearFallback(userId, async (client) => {
      const viewer = await client.viewer;
      const result = await client.issues({
        first: 1,
        filter: {
          assignee: { id: { eq: viewer.id } },
          completedAt: { gte: sixMonthsAgo.toDate() },
        },
      });
      return result.nodes.length > 0;
    });
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      needsLinearReauth = true;
    } else {
      console.error("[welcome-pack] Linear eligibility check failed:", error);
    }
  }

  if (wave1Hit) {
    return { eligible: true, wave: 1 };
  }

  if (pack?.wave2Open) {
    return { eligible: true, wave: 2 };
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

  return {
    eligible: false,
    wave: null,
    reason:
      "Wave 1 is open to developers with a Linear issue completed in the last 6 months. Wave 2 will open later for everyone else.",
  };
}

/**
 * Lighter check used by the submit action — re-validates that the caller is
 * still eligible before creating an order. Throws on ineligibility so the
 * action can surface a clean error.
 */
export async function assertEligibleForWelcomePack(
  userId: string,
): Promise<{ wave: 1 | 2 }> {
  const result = await checkWelcomePackEligibility(userId);
  if (!result.eligible || result.wave === null) {
    throw new Error(result.reason ?? "Not eligible for the welcome pack");
  }
  return { wave: result.wave };
}

// Re-export so callers don't have to also import from the linear lib for
// reauth handling.
export { getLinearClient, LinearReauthRequiredError };
