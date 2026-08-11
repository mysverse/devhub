import {
  DEFAULT_STABILITY_MINUTES,
  PROOF_MIN_CHARS,
  PROOF_TAG,
} from "./payout-policy";

// Client-safe copy for the PPT payout state machine: plain-language reason
// strings, the developer-facing next step per reason, and the owner
// classification ("who is this waiting on"). Extracted from ppt-eligibility.ts
// (which re-exports env-aware wrappers) so client components can render the
// same copy without pulling in server-only dependencies.

export type PptReason =
  | "MISSING_PPT_LABEL"
  | "PPT_LABEL_REMOVED"
  | "PPT_LABEL_REMOVED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_LABEL_REMOVED"
  | "NOT_COMPLETED"
  | "ISSUE_CANCELED"
  | "ISSUE_CANCELED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_CANCELED"
  | "ISSUE_ARCHIVED_OR_TRASHED"
  | "ISSUE_ARCHIVED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_ARCHIVED"
  | "MISSING_ESTIMATE"
  | "MISSING_ASSIGNEE"
  | "NO_LINKED_USER"
  | "MISSING_PROOF"
  | "PROOF_NOT_QUALIFYING"
  | "PROOF_RESET_BY_QUESTION"
  | "PAID_ISSUE_NEEDS_REVIEW"
  | "WAITING_STABILITY"
  | "DUPLICATE_TRANSACTION"
  | "APPROVED_BONUS_EXISTS"
  | "LINEAR_API_ERROR"
  | "REOPENED_BEFORE_PAYOUT"
  | "REOPENED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_REOPENED"
  | "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK"
  | "ASSIGNEE_CHANGED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_REASSIGNED"
  | "ESTIMATE_CHANGED_RECALCULATED"
  | "ESTIMATE_CHANGED_DURING_PROCESSING"
  | "PAID_ISSUE_ESTIMATE_CHANGED"
  | "STALE_LINEAR_WEBHOOK"
  | "READY_FOR_PAYOUT"
  | "TRANSACTION_CREATED"
  | "AUTO_PAYOUT_STARTED";

export type PptStatus =
  | "BLOCKED"
  | "NEEDS_PROOF"
  | "WAITING_STABILITY"
  | "READY_FOR_PAYOUT"
  | "TRANSACTION_PENDING"
  | "ON_HOLD"
  | "PAID"
  | "FLAGGED";

export type PptCopyOptions = {
  /** Resolved stability window; server callers thread the env-aware value. */
  stabilityMinutes?: number;
};

export function formatReason(reason: PptReason | null | undefined): string {
  const copy: Record<PptReason, string> = {
    MISSING_PPT_LABEL: "The issue does not have the PPT label.",
    PPT_LABEL_REMOVED:
      "The PPT label was removed after DevHub started tracking payout eligibility.",
    PPT_LABEL_REMOVED_DURING_PAYOUT_PROCESSING:
      "The PPT label was removed while a payout provider was already processing payment.",
    PAID_ISSUE_LABEL_REMOVED:
      "The PPT label was removed after DevHub had already marked the payout paid.",
    NOT_COMPLETED: "The issue is not currently in a completed Linear state.",
    ISSUE_CANCELED: "The Linear issue was canceled before payout was released.",
    ISSUE_CANCELED_DURING_PAYOUT_PROCESSING:
      "The issue was canceled while a payout provider was already processing payment.",
    PAID_ISSUE_CANCELED:
      "The issue was canceled after DevHub had already marked the payout paid.",
    ISSUE_ARCHIVED_OR_TRASHED:
      "The Linear issue was archived or moved to trash before payout was released.",
    ISSUE_ARCHIVED_DURING_PAYOUT_PROCESSING:
      "The issue was archived or trashed while a payout provider was already processing payment.",
    PAID_ISSUE_ARCHIVED:
      "The issue was archived or trashed after DevHub had already marked the payout paid.",
    MISSING_ESTIMATE: "The issue does not have a complexity estimate.",
    MISSING_ASSIGNEE: "The issue is not assigned to a developer.",
    NO_LINKED_USER:
      "The Linear assignee is not linked to a DevHub developer profile.",
    MISSING_PROOF: `A recent ${PROOF_TAG} comment from the assignee is required.`,
    PROOF_NOT_QUALIFYING: `A ${PROOF_TAG} comment was posted, but it does not qualify yet.`,
    PROOF_RESET_BY_QUESTION:
      "A follow-up question was asked after completion, so fresh proof is required.",
    PAID_ISSUE_NEEDS_REVIEW:
      "The issue changed after payout was paid and needs admin review.",
    WAITING_STABILITY:
      "The task needs to remain completed for the payout stability window.",
    DUPLICATE_TRANSACTION:
      "A payout transaction already exists for this Linear issue.",
    APPROVED_BONUS_EXISTS:
      "This issue already has an approved bonus payout candidate.",
    LINEAR_API_ERROR:
      "DevHub could not verify the latest Linear comments or history.",
    REOPENED_BEFORE_PAYOUT:
      "The issue was moved out of Done before payout was released.",
    REOPENED_DURING_PAYOUT_PROCESSING:
      "The issue reopened while a payout provider was already processing payment.",
    PAID_ISSUE_REOPENED:
      "The issue reopened after DevHub had already marked the payout paid.",
    ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK:
      "The assignee changed after DevHub had already prepared this payout.",
    ASSIGNEE_CHANGED_DURING_PAYOUT_PROCESSING:
      "The assignee changed while a payout provider was already processing payment.",
    PAID_ISSUE_REASSIGNED:
      "The issue was reassigned after DevHub had already marked the payout paid.",
    ESTIMATE_CHANGED_RECALCULATED:
      "The estimate changed, so DevHub recalculated the unpaid payout.",
    ESTIMATE_CHANGED_DURING_PROCESSING:
      "The estimate changed while a payout provider was already processing payment.",
    PAID_ISSUE_ESTIMATE_CHANGED:
      "The estimate changed after DevHub had already marked the payout paid.",
    STALE_LINEAR_WEBHOOK:
      "DevHub ignored an older Linear webhook because newer issue state is already recorded.",
    READY_FOR_PAYOUT: "The issue is ready for payout.",
    TRANSACTION_CREATED: "A payout transaction was created.",
    AUTO_PAYOUT_STARTED: "Automatic payout was started.",
  };
  return reason ? copy[reason] : "PPT payout eligibility changed.";
}

export function getActionForReason(
  reason: PptReason | null | undefined,
  options?: PptCopyOptions,
): string {
  const stabilityMinutes =
    options?.stabilityMinutes ?? DEFAULT_STABILITY_MINUTES;
  if (reason === "PROOF_NOT_QUALIFYING") {
    return `Post a fresh ${PROOF_TAG} comment with at least ${PROOF_MIN_CHARS} characters describing what changed, and attach a screenshot or clip — or paste a link, commit SHA, or issue reference.`;
  }
  if (reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION") {
    return `Reply in Linear or use DevHub with ${PROOF_TAG}, what changed, where it is implemented, and how it was verified — with a screenshot, clip, or link attached.`;
  }
  if (reason === "WAITING_STABILITY") {
    return `Keep the issue in Done for ${stabilityMinutes} minutes. DevHub will check again automatically.`;
  }
  if (reason === "REOPENED_BEFORE_PAYOUT") {
    return `Move the issue back to Done only when it is truly complete, then submit fresh ${PROOF_TAG}.`;
  }
  if (
    reason === "PPT_LABEL_REMOVED" ||
    reason === "PPT_LABEL_REMOVED_DURING_PAYOUT_PROCESSING" ||
    reason === "PAID_ISSUE_LABEL_REMOVED"
  ) {
    return "Restore the PPT label only if this issue should be payable. DevHub will require a fresh eligibility check before payout.";
  }
  if (
    reason === "ISSUE_CANCELED" ||
    reason === "ISSUE_CANCELED_DURING_PAYOUT_PROCESSING" ||
    reason === "PAID_ISSUE_CANCELED" ||
    reason === "ISSUE_ARCHIVED_OR_TRASHED" ||
    reason === "ISSUE_ARCHIVED_DURING_PAYOUT_PROCESSING" ||
    reason === "PAID_ISSUE_ARCHIVED"
  ) {
    return `Restore/reopen the Linear issue only if it is valid work, move it to Done again, and submit fresh ${PROOF_TAG}.`;
  }
  if (
    reason === "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK" ||
    reason === "ASSIGNEE_CHANGED_DURING_PAYOUT_PROCESSING" ||
    reason === "PAID_ISSUE_REASSIGNED"
  ) {
    return `The current assignee must submit fresh ${PROOF_TAG} before DevHub can release or resume payout.`;
  }
  if (
    reason === "ESTIMATE_CHANGED_RECALCULATED" ||
    reason === "ESTIMATE_CHANGED_DURING_PROCESSING" ||
    reason === "PAID_ISSUE_ESTIMATE_CHANGED"
  ) {
    return "Admins have been notified. Unpaid payouts are recalculated before release; paid or processing payouts require admin review.";
  }
  if (reason === "NO_LINKED_USER") {
    return "Link your Linear account in DevHub settings or contact an admin.";
  }
  if (reason === "MISSING_ESTIMATE") {
    return "Ask an admin or task owner to add the Linear estimate.";
  }
  if (reason === "READY_FOR_PAYOUT") {
    return "DevHub will create or route the payout automatically.";
  }
  if (
    reason === "TRANSACTION_CREATED" ||
    reason === "AUTO_PAYOUT_STARTED" ||
    reason === "DUPLICATE_TRANSACTION"
  ) {
    return "DevHub is already tracking this payout. No developer action is needed.";
  }
  return "Open the task and follow the DevHub payout guidance.";
}

/**
 * Developer-safe payout event copy — a WHITELIST. Events not listed here
 * (admin alerts, internal bookkeeping) must never render for developers, and
 * raw event `message`/`metadata` may contain admin notes — never display them.
 */
export const PPT_EVENT_COPY: Record<string, string> = {
  COMPLETED_DETECTED: "Task completion detected",
  REOPENED_DETECTED: "Task moved out of Done",
  PROOF_MISSING: "Waiting for proof",
  PROOF_ACCEPTED: "Proof accepted",
  PROOF_RESET: "Proof reset — fresh proof needed",
  WAITING_STABILITY: "Stability window started",
  PAYOUT_BLOCKED: "Payout blocked",
  PAYOUT_HELD: "Payout held",
  PAYOUT_RESUMED: "Payout resumed",
  PAYOUT_READY: "Ready for payout",
  TRANSACTION_CREATED: "Payment created",
  AUTO_PAYOUT_STARTED: "Automatic payout started",
  PAID_ISSUE_REOPENED: "Task reopened after payment",
};

export type PptNextStepOwner = "developer" | "admin" | "automatic";

/** Badge copy for the owner classification — "who is this waiting on". */
export const PPT_OWNER_COPY: Record<
  PptNextStepOwner,
  { label: string; color: string }
> = {
  developer: { label: "Waiting on you", color: "yellow" },
  admin: { label: "Waiting on admin", color: "violet" },
  automatic: { label: "Automatic", color: "gray" },
};

export function describePptNextStep(
  status: PptStatus | string | null | undefined,
  reason: PptReason | string | null | undefined,
  options?: PptCopyOptions,
): {
  owner: PptNextStepOwner;
  action: string | null;
} {
  const pptStatus = status as PptStatus | null | undefined;
  const pptReason = reason as PptReason | null | undefined;

  if (pptStatus === "PAID") {
    return { owner: "automatic", action: null };
  }

  const developerReasons = new Set<PptReason>([
    "MISSING_PROOF",
    "PROOF_NOT_QUALIFYING",
    "PROOF_RESET_BY_QUESTION",
    "MISSING_ESTIMATE",
    "MISSING_ASSIGNEE",
    "NO_LINKED_USER",
    "PPT_LABEL_REMOVED",
    "REOPENED_BEFORE_PAYOUT",
  ]);
  const adminReasons = new Set<PptReason>([
    "PAID_ISSUE_LABEL_REMOVED",
    "PPT_LABEL_REMOVED_DURING_PAYOUT_PROCESSING",
    "PAID_ISSUE_CANCELED",
    "ISSUE_CANCELED_DURING_PAYOUT_PROCESSING",
    "PAID_ISSUE_ARCHIVED",
    "ISSUE_ARCHIVED_DURING_PAYOUT_PROCESSING",
    "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
    "ASSIGNEE_CHANGED_DURING_PAYOUT_PROCESSING",
    "PAID_ISSUE_REASSIGNED",
    "ESTIMATE_CHANGED_DURING_PROCESSING",
    "PAID_ISSUE_ESTIMATE_CHANGED",
    "DUPLICATE_TRANSACTION",
    "APPROVED_BONUS_EXISTS",
    "LINEAR_API_ERROR",
  ]);
  const automaticReasons = new Set<PptReason>([
    "WAITING_STABILITY",
    "READY_FOR_PAYOUT",
    "TRANSACTION_CREATED",
    "AUTO_PAYOUT_STARTED",
    "DUPLICATE_TRANSACTION",
  ]);

  const owner =
    pptStatus === "FLAGGED" || (pptReason && adminReasons.has(pptReason))
      ? "admin"
      : pptReason && developerReasons.has(pptReason)
        ? "developer"
        : pptReason && automaticReasons.has(pptReason)
          ? "automatic"
          : pptStatus === "WAITING_STABILITY" ||
              pptStatus === "READY_FOR_PAYOUT" ||
              pptStatus === "TRANSACTION_PENDING"
            ? "automatic"
            : "admin";

  return {
    owner,
    action: pptReason ? getActionForReason(pptReason, options) : null,
  };
}
