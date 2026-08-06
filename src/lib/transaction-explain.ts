import type { Payout, PptPayoutState, Transaction } from "@prisma/client";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { campaignAmountBreakdown } from "@/lib/payout-campaign";
import { WEEKLY_CREDIT_LIMITS } from "@/lib/payout-policy";
import {
  describePptNextStep,
  formatReason,
  getActionForReason,
  type PptNextStepOwner,
} from "@/lib/ppt-reason-copy";

// Answers "why is this transaction in this state?" from existing fields only
// (autoApproved, Payout.status, PptPayoutState.reason). This is the single
// derivation used by the transactions page and the overview list, so the
// story a developer reads is the same everywhere.

export type TransactionExplainInput = Transaction & {
  payout?: Payout | null;
  pptPayoutState?: Pick<PptPayoutState, "status" | "reason"> | null;
  /** Joined in by callers that want the campaign named in the breakdown. */
  campaignName?: string | null;
};

export type TransactionExplanation = {
  /** One-line answer shown next to the status badge. */
  headline: string;
  /** Optional second line: consequence and next step. */
  detail: string | null;
  tone: "positive" | "info" | "warning" | "critical";
  /** Who the current state is waiting on, when meaningful. */
  owner: PptNextStepOwner | null;
  /**
   * "RM20.00 x 3x (Raya Sprint) = RM60.00" when a campaign inflated this
   * payout. Without it the amount is unexplainable next to the documented
   * per-point rate, which is exactly the kind of gap that turns into a
   * support message.
   */
  campaignBreakdown: string | null;
};

/**
 * The campaign arithmetic for a transaction, or null when it paid the normal
 * rate. Kept separate from the status explanation because the two answer
 * different questions and every branch below would otherwise repeat it.
 */
export function explainTransactionCampaign(
  tx: TransactionExplainInput,
): string | null {
  if (!tx.campaignMultiplier || tx.campaignMultiplier <= 1) return null;
  const baseAmount = tx.baseAmount ?? tx.amount / tx.campaignMultiplier;
  return campaignAmountBreakdown({
    baseAmount,
    multiplier: tx.campaignMultiplier,
    finalAmount: tx.amount,
    currency: toCurrencyCode(tx.currency),
    campaignName: tx.campaignName ?? "Campaign",
  });
}

const PROVIDER_LABELS: Record<string, string> = {
  BILLPLZ: "Billplz",
  XENDIT: "Xendit",
  ROBLOX: "Roblox",
};

function toCurrencyCode(currency: string): CurrencyCode {
  return currency === "ROBUX" ? "ROBUX" : "MYR";
}

export function explainTransaction(
  tx: TransactionExplainInput,
): TransactionExplanation {
  return {
    ...explainTransactionStatus(tx),
    campaignBreakdown: explainTransactionCampaign(tx),
  };
}

function explainTransactionStatus(
  tx: TransactionExplainInput,
): Omit<TransactionExplanation, "campaignBreakdown"> {
  const payout = tx.payout ?? null;
  const pptState = tx.pptPayoutState ?? null;

  if (tx.status === "PAID") {
    return {
      headline: "Paid to your payout method.",
      detail: null,
      tone: "positive",
      owner: null,
    };
  }

  if (tx.status === "REJECTED") {
    return {
      headline: "Rejected by an admin.",
      detail:
        tx.rejectionReason ??
        "No reason was recorded — contact an admin if this is unexpected.",
      tone: "critical",
      owner: "admin",
    };
  }

  if (tx.status === "CANCELLED") {
    return {
      headline: "Cancelled — this payment won't be sent.",
      detail: null,
      tone: "info",
      owner: null,
    };
  }

  if (tx.status === "ON_HOLD") {
    const nextStep = pptState
      ? describePptNextStep(pptState.status, pptState.reason)
      : null;
    return {
      headline: pptState?.reason
        ? formatReason(pptState.reason)
        : "Paused because the task changed after completion.",
      detail: pptState?.reason ? getActionForReason(pptState.reason) : null,
      tone: "warning",
      owner: nextStep?.owner ?? "automatic",
    };
  }

  // PENDING
  if (payout && payout.status === "FAILED") {
    return {
      headline: "The payout attempt failed — an admin will retry it.",
      detail:
        "Nothing is needed from you. If this repeats, double-check your payment details in HR Settings.",
      tone: "warning",
      owner: "admin",
    };
  }

  if (
    payout &&
    (payout.status === "PENDING" || payout.status === "PROCESSING")
  ) {
    const provider = PROVIDER_LABELS[payout.provider] ?? payout.provider;
    return {
      headline: `Payment is processing via ${provider}.`,
      detail: "The provider is sending your payment — no action needed.",
      tone: "info",
      owner: "automatic",
    };
  }

  if (payout && payout.status === "COMPLETED") {
    return {
      headline: "Payment completed — the record updates shortly.",
      detail: null,
      tone: "positive",
      owner: "automatic",
    };
  }

  if (tx.source === "PPT") {
    if (tx.autoApproved) {
      return {
        headline: "Queued for automatic payout.",
        detail:
          "This payout is within your weekly credit limit, so DevHub sends it automatically.",
        tone: "info",
        owner: "automatic",
      };
    }
    const currency = toCurrencyCode(tx.currency);
    const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
    return {
      headline: "Awaiting admin review.",
      detail: `This payout takes you past this week's ${formatAmount(
        limit,
        currency,
      )} auto-approval limit, so an admin releases it manually. It is not lost — limits reset every Monday (UTC).`,
      tone: "warning",
      owner: "admin",
    };
  }

  if (tx.source === "BONUS") {
    return {
      headline: "Approved — included in the next admin payout run.",
      detail: null,
      tone: "info",
      owner: "admin",
    };
  }

  if (tx.source === "INCENTIVE") {
    return {
      headline: "Pending release after the admin review window.",
      detail: null,
      tone: "info",
      owner: "automatic",
    };
  }

  return {
    headline: "Created by an admin — paid in the next payout run.",
    detail: null,
    tone: "info",
    owner: "admin",
  };
}
