import { runBatch } from "@/lib/fault-isolation";
import {
  isSweepableNotification,
  NOTIFICATION_RETRY_MAX_AGE_MS,
  type RetryCandidate,
  selectDeliveriesToRetry,
} from "@/lib/notification-retry";
import { EMAIL_CHANNEL, retryNotificationEmail } from "@/lib/notifications";
import { NOTIFICATION_CATALOG } from "@/lib/notifications/catalog";
import prisma from "@/lib/prisma";

/** Types whose retry is owned by their own reconciler — skipping these is
 *  correct, not drift, so they must not be reported as missing entries. */
const OWNED_KEYS = new Set(
  NOTIFICATION_CATALOG.filter((entry) => entry.emailRetry === "owned").map(
    (entry) => `${entry.domain}:${entry.type}`,
  ),
);

/** Rows examined per run. */
const SCAN_LIMIT = 200;
/** Emails actually re-sent per run, so a backlog drains over hours. */
const WORK_LIMIT = 25;

/**
 * Re-attempts email deliveries that failed, for every notification type whose
 * catalog entry says the generic sweep owns the retry.
 *
 * The eligibility rule lives in notification-retry.ts; this is only the IO.
 */
export async function sweepFailedNotificationEmails() {
  const now = Date.now();

  const candidates = await prisma.notificationDelivery.findMany({
    where: {
      channel: EMAIL_CHANNEL,
      status: "FAILED",
      notification: {
        createdAt: { gte: new Date(now - NOTIFICATION_RETRY_MAX_AGE_MS) },
      },
    },
    select: {
      id: true,
      notificationId: true,
      status: true,
      updatedAt: true,
      notification: {
        select: { domain: true, type: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: SCAN_LIMIT,
  });

  const due: RetryCandidate[] = selectDeliveriesToRetry(candidates, now);

  // An unknown domain:type is skipped on purpose — nobody has declared whether
  // its email can be rebuilt from the Notification row. But skipping silently
  // makes catalog drift look like "there was nothing to repair", which is how
  // four admin-alert types went unswept without anyone noticing. Say it.
  const unknown = [
    ...new Set(
      candidates
        .filter(
          (candidate) =>
            !isSweepableNotification(
              candidate.notification.domain,
              candidate.notification.type,
            ),
        )
        .map(
          (candidate) =>
            `${candidate.notification.domain}:${candidate.notification.type}`,
        ),
    ),
  ].filter((key) => !OWNED_KEYS.has(key));

  if (unknown.length > 0) {
    console.warn(
      `[notification-email-retry] skipped failed deliveries for type(s) with no catalog entry: ${unknown.join(", ")} — add them to NOTIFICATION_CATALOG`,
    );
  }

  return runBatch<RetryCandidate, "resent" | "still-failing" | "unrepairable">({
    label: "notification-email-retry",
    items: due,
    scanLimit: candidates.length === SCAN_LIMIT ? SCAN_LIMIT : undefined,
    workLimit: WORK_LIMIT,
    identify: (delivery) =>
      `${delivery.notification.domain}:${delivery.notification.type} ${delivery.notificationId}`,
    run: async (delivery) => {
      const result = await retryNotificationEmail(delivery.notificationId);
      // The notification row vanished between the scan and now — nothing to
      // repair, and not a failure worth alarming about.
      if ("error" in result) return "unrepairable";

      // retryNotificationEmail reports whether the re-attempt RAN, not whether
      // it landed: ensureEmailDelivery catches a provider failure and writes
      // FAILED again. Read the row back so the cron's tally means what it
      // says — a "resent" count that includes sends the provider rejected is
      // the kind of green number that hides an outage.
      const after = await prisma.notificationDelivery.findUnique({
        where: { id: delivery.id },
        select: { status: true },
      });
      return after?.status === "SENT" ? "resent" : "still-failing";
    },
  });
}
