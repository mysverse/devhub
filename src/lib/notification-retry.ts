import { NOTIFICATION_CATALOG } from "@/lib/notifications/catalog";

/**
 * Which failed email deliveries the generic reconciler may re-attempt.
 *
 * `ensureEmailDelivery` records FAILED rows across the whole app — KYC
 * verdicts, PPT request decisions, payment rejections, access changes — and
 * until now nothing read them. `retryNotificationEmail()` has implemented the
 * correct re-attempt since it was written and had zero callers.
 *
 * Kept apart from the IO so the eligibility rule is unit-testable without a
 * DATABASE_URL. Importing the catalog is safe here: it has no imports at all.
 */

/**
 * How long a FAILED row must sit before the sweep touches it. Short, but not
 * zero: the emit path that just failed may still be reporting that failure to
 * a user who is about to press a resend button themselves.
 */
export const NOTIFICATION_RETRY_GRACE_MS = 5 * 60 * 1000;

/**
 * Past this, stop trying. An email about a KYC decision from last week is not
 * worth sending now, and a permanently broken address should stop consuming
 * the hourly budget. Bounded age is also what stands in for an attempts
 * column — a successful retry flips the row to SENT and it leaves the set.
 */
export const NOTIFICATION_RETRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SWEEPABLE_KEYS = new Set(
  NOTIFICATION_CATALOG.filter((entry) => entry.emailRetry === "sweep").map(
    (entry) => `${entry.domain}:${entry.type}`,
  ),
);

/**
 * Unknown types are NOT sweepable. An emit site with no catalog entry has
 * never declared whether its email can be rebuilt from the Notification row,
 * and guessing "yes" is how the payment slip would have been lost.
 */
export function isSweepableNotification(domain: string, type: string): boolean {
  return SWEEPABLE_KEYS.has(`${domain}:${type}`);
}

export type RetryCandidate = {
  id: string;
  notificationId: string;
  status: string;
  updatedAt: Date;
  notification: { domain: string; type: string; createdAt: Date };
};

export function selectDeliveriesToRetry<T extends RetryCandidate>(
  candidates: readonly T[],
  now: number = Date.now(),
): T[] {
  return candidates.filter((candidate) => {
    if (candidate.status !== "FAILED") return false;
    if (
      !isSweepableNotification(
        candidate.notification.domain,
        candidate.notification.type,
      )
    ) {
      return false;
    }
    if (now - candidate.updatedAt.getTime() < NOTIFICATION_RETRY_GRACE_MS) {
      return false;
    }
    return (
      now - candidate.notification.createdAt.getTime() <=
      NOTIFICATION_RETRY_MAX_AGE_MS
    );
  });
}
