import type { IncentiveAwardStatus } from "@prisma/client";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { incentiveHeldDeveloperCopy } from "@/lib/incentive-copy";
import { formatWeekLabel } from "@/lib/incentive-period";

/**
 * Where an incentive award is on its way to the developer's bank account, and
 * what — if anything — they should do about it.
 *
 * The same idea as `explainTransaction`: one derivation, used by every surface,
 * so the story a developer reads is the same everywhere. It exists because the
 * old answer was a status badge and a legend in a drawer, which asked the
 * developer to learn that "Pending release" and "Held for review" are different
 * things and to work out which of the two was their problem. Both are the same
 * step of the same journey — one moving, one stopped — and a tracker says that
 * without any words at all.
 */

export type IncentiveStepKey = "earned" | "review" | "sending" | "paid";

export const INCENTIVE_STEPS: { key: IncentiveStepKey; label: string }[] = [
  { key: "earned", label: "Earned" },
  { key: "review", label: "Review" },
  { key: "sending", label: "Sending" },
  { key: "paid", label: "Paid" },
];

/** Matches TONE_COLORS on the transactions page: green / blue / yellow / red. */
export type IncentiveTone = "positive" | "info" | "warning" | "critical";

/** Who the award is waiting on, mirroring PPT_OWNER_COPY. */
export type IncentiveOwner = "developer" | "admin" | "automatic";

export type IncentiveAwardExplanation = {
  /** Index into INCENTIVE_STEPS, or -1 when the journey stopped. */
  stepIndex: number;
  /** On a step, but not moving — a hold. */
  paused: boolean;
  /** Ended without a payout, or ended somewhere other than "paid". */
  stopped: boolean;
  headline: string;
  detail: string | null;
  tone: IncentiveTone;
  owner: IncentiveOwner;
  /**
   * When the award becomes eligible for the next release run, if it is waiting
   * on the clock. The UI renders the countdown; this decides whether there is
   * one.
   */
  releasesAt: Date | null;
};

export type ExplainableAward = {
  status: IncentiveAwardStatus | string;
  heldReason?: string | null;
  releaseAt?: Date | string | null;
  amount: number;
  currency: string;
  period: string;
};

const STEP_INDEX: Record<string, number> = {
  PENDING: 1,
  HELD: 1,
  RELEASING: 2,
  TRANSACTION_PENDING: 2,
  PAID: 3,
};

/** Which step of the tracker a status sits on. -1 means the journey stopped. */
export function stepIndexForStatus(status: IncentiveAwardStatus | string) {
  return STEP_INDEX[status] ?? -1;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function explainIncentiveAward(
  award: ExplainableAward,
  now: Date = new Date(),
): IncentiveAwardExplanation {
  const amount = formatAmount(award.amount, award.currency as CurrencyCode);
  const releaseAt = toDate(award.releaseAt);
  const base = {
    stepIndex: stepIndexForStatus(award.status),
    paused: false,
    stopped: false,
    releasesAt: null as Date | null,
  };

  switch (award.status) {
    case "PENDING": {
      // The window is the promise: nobody has to do anything, it just has to
      // pass. Saying when it ends is the whole answer, so the countdown is the
      // primary line and the release cron's hourly cadence is the caveat.
      const due = !releaseAt || releaseAt <= now;
      return {
        ...base,
        headline: due
          ? "Sending on the next payout run"
          : "Waiting out the review window",
        detail: due
          ? "Payout runs go out every hour."
          : "It releases on its own — nothing needed from you.",
        tone: "info",
        owner: "automatic",
        releasesAt: due ? null : releaseAt,
      };
    }
    case "HELD": {
      const copy = incentiveHeldDeveloperCopy(award.heldReason);
      return {
        ...base,
        paused: true,
        headline: copy.headline,
        detail:
          copy.owner === "developer"
            ? "It stays paused until the task is put back the way it was, or an admin decides."
            : "Nothing needed from you — it starts moving again as soon as they clear it.",
        tone: "warning",
        owner: copy.owner,
        releasesAt: null,
      };
    }
    case "RELEASING":
      return {
        ...base,
        headline: "Being prepared for payout",
        detail: null,
        tone: "info",
        owner: "automatic",
      };
    case "TRANSACTION_PENDING":
      return {
        ...base,
        headline: `${amount} is on its way`,
        detail: "It shows up in your transactions once the bank confirms it.",
        tone: "info",
        owner: "automatic",
      };
    case "PAID":
      return {
        ...base,
        headline: `${amount} paid`,
        detail: null,
        tone: "positive",
        owner: "automatic",
      };
    case "CANCELLED":
      return {
        ...base,
        stopped: true,
        headline: "Cancelled",
        detail: `This ${formatWeekLabel(award.period).toLowerCase()} award will not be paid.`,
        tone: "critical",
        owner: "admin",
      };
    case "CLAWBACK_REQUESTED":
      return {
        ...base,
        stopped: true,
        headline: `${amount} is being recovered`,
        detail: "It comes out of your next incentive payout.",
        tone: "warning",
        owner: "admin",
      };
    case "SETTLED_BY_CLAWBACK":
      return {
        ...base,
        stopped: true,
        headline: `${amount} settled an earlier clawback`,
        detail: "Nothing is owed on it any more, and nothing is paid out.",
        tone: "positive",
        owner: "automatic",
      };
    default:
      return {
        ...base,
        headline: "In progress",
        detail: null,
        tone: "info",
        owner: "automatic",
      };
  }
}

/**
 * Developer-safe labels for an award's event trail.
 *
 * A whitelist for the same reason PPT_EVENT_COPY is one: the raw `message` and
 * `metadata` on an IncentiveEvent carry hold reasons, cap arithmetic and admin
 * notes, and none of that may reach a developer. Anything not named here simply
 * does not render.
 */
export const INCENTIVE_EVENT_COPY: Record<string, string> = {
  AWARD_CREATED: "Award earned",
  HELD: "Paused for a check",
  HELD_APPROVED: "Cleared by an admin",
  TX_CREATED: "Payout created",
  AUTO_PAYOUT_STARTED: "Sent to your payout method",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  CLAWBACK_REQUESTED: "Clawback requested",
  SETTLED_BY_CLAWBACK: "Settled against a clawback",
};
