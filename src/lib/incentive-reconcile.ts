import { runBatch } from "@/lib/fault-isolation";
import { markIncentiveAwardsPaidForTransaction } from "@/lib/incentives";
import prisma from "@/lib/prisma";

/**
 * Repairs incentive awards left mid-flight by a failure between two writes.
 *
 * Two states are unreachable by any other code path:
 *
 *   RELEASING — releaseAwardGroup compare-and-sets a group into RELEASING with
 *   a claim token, then performs several further writes. A failure in between
 *   strands them: releaseDueIncentives only ever re-selects PENDING awards
 *   with a null transactionId, and no admin action accepts RELEASING. The
 *   award is then never paid and never visible as unpaid.
 *
 *   TRANSACTION_PENDING on a PAID transaction — the money went out, but the
 *   swallowed markIncentiveAwardsPaidForTransaction never ran. The developer's
 *   history says "awaiting payment" for money they already have, and a
 *   clawback request on that award is refused.
 *
 * No pure sibling module: both rules are a single indexed `where` clause with
 * nothing derived, and a "pure" function that only restates a where clause is
 * pattern-matching rather than testing.
 */

/**
 * How long a release claim may sit before it is presumed abandoned. Comfortably
 * longer than a release takes, and shorter than the hourly cron interval, so a
 * claim in flight is never stolen from a live invocation.
 */
export const RELEASE_CLAIM_STALE_MS = 15 * 60 * 1000;

const SCAN_LIMIT = 200;

/**
 * Returns claims stranded in RELEASING to PENDING so the normal release path
 * picks them up on its next run. Deliberately does NOT try to finish the
 * release itself — re-deriving where the original invocation got to is exactly
 * the ambiguity that makes half-finished money work dangerous. Handing it back
 * to the one code path that knows how to do it is safer and simpler.
 */
export async function sweepStrandedReleaseClaims() {
  const stranded = await prisma.incentiveAward.findMany({
    where: {
      status: "RELEASING",
      transactionId: null,
      claimedAt: { lt: new Date(Date.now() - RELEASE_CLAIM_STALE_MS) },
    },
    select: { id: true, releaseClaimId: true },
    orderBy: { claimedAt: "asc" },
    take: SCAN_LIMIT,
  });

  return runBatch({
    label: "incentive-stranded-releases",
    items: stranded,
    scanLimit: SCAN_LIMIT,
    identify: (award) => award.id,
    run: async (award) => {
      // Guarded on the same status it was selected in, so a release that woke
      // up and finished in the meantime is not clobbered.
      await prisma.incentiveAward.updateMany({
        where: { id: award.id, status: "RELEASING", transactionId: null },
        data: { status: "PENDING", claimedAt: null, releaseClaimId: null },
      });
    },
  });
}

/**
 * Re-runs the award bookkeeping for transactions that are already PAID.
 * markIncentiveAwardsPaidForTransaction is idempotent — it selects only
 * TRANSACTION_PENDING awards and returns early when there are none.
 */
export async function sweepAwardsOfPaidTransactions() {
  const mismatched = await prisma.incentiveAward.findMany({
    where: {
      status: "TRANSACTION_PENDING",
      transaction: { status: "PAID" },
    },
    select: { transactionId: true },
    distinct: ["transactionId"],
    take: SCAN_LIMIT,
  });

  const transactionIds = mismatched
    .map((award) => award.transactionId)
    .filter((id): id is string => Boolean(id));

  return runBatch({
    label: "incentive-awards-of-paid-transactions",
    items: transactionIds,
    scanLimit: SCAN_LIMIT,
    identify: (id) => id,
    run: async (transactionId) => {
      await markIncentiveAwardsPaidForTransaction(transactionId);
    },
  });
}
