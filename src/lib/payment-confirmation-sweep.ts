import { isDeliverySettled } from "@/lib/delivery-staleness";

/**
 * Which paid transactions still owe their developer a confirmation email.
 *
 * `sendPaymentConfirmation()` is best-effort at every call site — a throw
 * there must not fail a payment that already happened. The cost is that a
 * transient failure (a Cloudflare worker killed mid-query, an email provider
 * blip) leaves a developer paid and never told, with nothing in the system
 * recording that. The Resend button on the payout card is the manual repair;
 * `sweepMissingPaymentConfirmations()` in payment-confirmation.ts is the
 * automatic one, for the webhook and cron payouts nobody is watching.
 *
 * The rule lives here, apart from the IO, so it can be unit-tested without a
 * DATABASE_URL — same split as payout-routing.ts vs payout.ts.
 */

/**
 * Mirrors EMAIL_CHANNEL, as a literal so this module stays free of the
 * notification barrel (which imports Prisma). payment-confirmation.ts asserts
 * at compile time that the two still agree.
 */
export const CONFIRMATION_EMAIL_CHANNEL = "email";

/** The key `notify()` dedupes a payment confirmation on. Shared so the sender
 *  and the sweep cannot drift onto different keys and stop seeing each other. */
export function paymentConfirmationDedupeKey(transactionId: string) {
  return `transaction:paid:${transactionId}`;
}

export type ConfirmationDelivery = {
  channel: string;
  status: string;
  updatedAt: Date;
  skippedReason: string | null;
};

export type ConfirmationNotification = {
  dedupeKey: string | null;
  deliveries: ConfirmationDelivery[];
};

/**
 * Skip reasons that are correct answers rather than failures. A developer with
 * no email on file will still have none next hour, and `deduped` means the
 * mail did go out under the same idempotency key. Everything else — including
 * `rate_limited` — deserves another attempt.
 */
const TERMINAL_SKIP_REASONS = new Set(["no-email-on-file", "deduped"]);

function needsResend(
  delivery: ConfirmationDelivery | undefined,
  now: number,
): boolean {
  // No email delivery row at all: either the notification itself was never
  // created, or the send died before reserving one.
  if (!delivery) return true;
  if (delivery.status === "SKIPPED") {
    return !TERMINAL_SKIP_REASONS.has(delivery.skippedReason ?? "");
  }
  // Leaves SENT alone, and PENDING rows young enough to still be in flight.
  return !isDeliverySettled(delivery, now);
}

export function selectTransactionsNeedingConfirmation(
  transactionIds: string[],
  notifications: ConfirmationNotification[],
  now: number = Date.now(),
): string[] {
  const byDedupeKey = new Map(
    notifications
      .filter((notification) => notification.dedupeKey)
      .map((notification) => [notification.dedupeKey as string, notification]),
  );

  return transactionIds.filter((transactionId) => {
    const notification = byDedupeKey.get(
      paymentConfirmationDedupeKey(transactionId),
    );
    if (!notification) return true;
    return needsResend(
      notification.deliveries.find(
        (delivery) => delivery.channel === CONFIRMATION_EMAIL_CHANNEL,
      ),
      now,
    );
  });
}
