/**
 * Payouts that no automated path can resolve, and that therefore need a human.
 *
 * Deliberately alert-only. "Did the money actually move?" is unanswerable
 * inside DevHub today: roblox.ts exposes no disbursement read at all,
 * xendit.ts's getDisbursement takes a Xendit id rather than our external_id,
 * and billplz.ts's getPaymentOrder takes a Billplz id — there is no lookup by
 * our own reference. Until a provider gives us a read or accepts an
 * idempotency key, the only safe action on an unknown payout is to tell an
 * admin. It must never be "send it again".
 *
 * That is also why this stays out of payment-confirmation-sweep.ts: one
 * sweep's repair is "send the email again" and is safe hourly forever, and
 * this one's subject is money. A shared sweep() would put a resend path one
 * parameter away from a disbursement.
 *
 * Pure, so the rule is testable without a DATABASE_URL.
 */

/**
 * How long a payout may sit in a non-terminal state before it is worth
 * raising. Long enough that a provider taking its time is not reported as
 * stuck; short enough that a real orphan is found the same working day.
 */
export const PAYOUT_STALE_MS = 6 * 60 * 60 * 1000;

/** Providers with a poll cron that can resolve a PROCESSING payout on its own,
 *  provided the payout carries the provider's id. */
const POLLED_PROVIDERS = new Set(["BILLPLZ", "XENDIT"]);

export type ReconcilablePayout = {
  id: string;
  transactionId: string;
  provider: string;
  status: string;
  providerPayoutId: string | null;
  updatedAt: Date;
};

export type PayoutReconcileReason =
  /** The provider call may or may not have gone through, and the poll crons
   *  filter on a non-null providerPayoutId, so nothing will ever look at it. */
  | "no-provider-id"
  /** FinSys/Roblox has no poll cron and no read endpoint, so a payout that
   *  stalls here is stuck until someone checks the provider by hand. */
  | "no-poll-cron";

export type PayoutReconcileFlag = {
  payout: ReconcilablePayout;
  reason: PayoutReconcileReason;
};

export function selectUnreconciledPayouts<T extends ReconcilablePayout>(
  payouts: readonly T[],
  now: number = Date.now(),
): { payout: T; reason: PayoutReconcileReason }[] {
  const flagged: { payout: T; reason: PayoutReconcileReason }[] = [];

  for (const payout of payouts) {
    // COMPLETED and FAILED are decided; nothing to reconcile.
    if (payout.status !== "PENDING" && payout.status !== "PROCESSING") continue;
    if (now - payout.updatedAt.getTime() < PAYOUT_STALE_MS) continue;

    if (!payout.providerPayoutId) {
      flagged.push({ payout, reason: "no-provider-id" });
    } else if (!POLLED_PROVIDERS.has(payout.provider)) {
      flagged.push({ payout, reason: "no-poll-cron" });
    }
    // Otherwise it has an id and a poll cron — that cron owns it.
  }

  return flagged;
}

export function describePayoutReconcileReason(
  reason: PayoutReconcileReason,
): string {
  return reason === "no-provider-id"
    ? "the provider call may have gone through but no provider id was recorded, so no poll can resolve it"
    : "this provider has no automated poll, so its result has to be checked by hand";
}
