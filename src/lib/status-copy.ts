import type {
  BonusCandidateStatus,
  KycStatus,
  PptAssignmentWatchStatus,
  PptPayoutStatus,
  PptRequestStatus,
  TxStatus,
  WelcomePackOrderStatus,
} from "@prisma/client";

// Client-safe status → label/color maps shared by every badge and status
// surface in the app. Follows the incentive-copy.ts pattern: type-only Prisma
// imports, no server-only dependencies, importable from server and client
// components alike.
//
// These maps are the single source of truth for status colors — never
// hardcode a status color at a call site. Incentive award statuses live in
// incentive-copy.ts (richer copy); it is re-exported here so there is one
// import point for status copy.

export { incentiveStatusCopy } from "@/lib/incentive-copy";

export type StatusCopy = {
  label: string;
  /** Mantine color name: green | blue | yellow | orange | red | gray | indigo */
  color: string;
  description?: string;
};

/**
 * Fallback-safe accessor: unknown/future statuses render as a gray badge with
 * the raw status as its label instead of crashing or disappearing.
 */
export function statusCopy<K extends string>(
  map: Partial<Record<K, StatusCopy>>,
  status: K | (string & {}),
): StatusCopy {
  return (
    map[status as K] ?? {
      label: String(status).replaceAll("_", " "),
      color: "gray",
    }
  );
}

export const BONUS_CANDIDATE_STATUS: Record<BonusCandidateStatus, StatusCopy> =
  {
    ELIGIBLE: {
      label: "Potential",
      color: "green",
      description:
        "This task qualifies for a bonus. The amount shown is the maximum possible — admins decide the final amount at the monthly review.",
    },
    READY_FOR_REVIEW: {
      label: "In review",
      color: "yellow",
      description:
        "The task is complete and waiting for the monthly admin bonus review.",
    },
    APPROVED: {
      label: "Approved",
      color: "blue",
      description:
        "An admin approved a bonus for this task. It is paid with your grouped monthly bonus payout.",
    },
    REJECTED: {
      label: "Rejected",
      color: "red",
      description:
        "An admin decided not to pay a bonus for this task — the reason is shown with the task.",
    },
    INELIGIBLE: {
      label: "Ineligible",
      color: "gray",
      description:
        "This task doesn't currently qualify for a bonus — the reason is listed with the task.",
    },
  };

export const PPT_REQUEST_STATUS: Record<PptRequestStatus, StatusCopy> = {
  PENDING: {
    label: "Pending",
    color: "yellow",
    description:
      "An admin hasn't reviewed this request yet. You'll be notified once it is approved or rejected.",
  },
  APPROVED: {
    label: "Approved",
    color: "green",
    description:
      "An admin approved this request — the task is now a PPT in Linear.",
  },
  REJECTED: {
    label: "Rejected",
    color: "red",
    description:
      "An admin declined this request. You can adjust it and submit it again.",
  },
};

export const PPT_PAYOUT_STATUS: Record<PptPayoutStatus, StatusCopy> = {
  BLOCKED: {
    label: "Blocked",
    color: "red",
    description:
      "Something prevents payout right now — the reason shows what's missing and how to fix it.",
  },
  NEEDS_PROOF: {
    label: "Needs proof",
    color: "yellow",
    description:
      "Payment is waiting for your #ppt-proof comment on the Linear issue describing what you did.",
  },
  WAITING_STABILITY: {
    label: "Waiting stability",
    color: "blue",
    description:
      "The task must stay in Done for a short stability window before payment is created. This happens automatically — you don't need to do anything.",
  },
  READY_FOR_PAYOUT: {
    label: "Ready for payout",
    color: "green",
    description:
      "All checks passed. DevHub is creating the payout automatically.",
  },
  TRANSACTION_PENDING: {
    label: "Transaction pending",
    color: "green",
    description:
      "A payout transaction exists for this task and is moving through the payment queue.",
  },
  ON_HOLD: {
    label: "On hold",
    color: "orange",
    description:
      "The payout is paused because the issue changed after completion — the reason shows what happened.",
  },
  PAID: {
    label: "Paid",
    color: "green",
    description: "The payout for this task has been paid.",
  },
  FLAGGED: {
    label: "Flagged",
    color: "red",
    description:
      "An admin needs to review this payout before anything else happens. No action is needed from you.",
  },
};

export const PPT_ASSIGNMENT_WATCH_STATUS: Record<
  PptAssignmentWatchStatus,
  StatusCopy
> = {
  ACTIVE: {
    label: "Active",
    color: "blue",
    description:
      "You're assigned and the activity timer is running. Any progress note or Linear activity resets it.",
  },
  WARNED: {
    label: "Warned",
    color: "yellow",
    description:
      "No visible activity for a while, so a reminder was sent. Post a progress note to reset the timer.",
  },
  SNOOZED: {
    label: "Snoozed",
    color: "violet",
    description: "An admin paused the activity timer for this task.",
  },
  BLOCKED: {
    label: "Blocked — waiting on someone",
    color: "orange",
    description:
      "You marked this task blocked, so the activity timer is paused for a limited window. It resumes automatically; unblock any time.",
  },
  UNASSIGNED: {
    label: "Unassigned",
    color: "orange",
    description:
      "The task was returned to the board after the activity window passed. You can reclaim it any time.",
  },
  RESOLVED: {
    label: "Resolved",
    color: "gray",
    description:
      "The task completed or the assignment ended — the activity timer is no longer running.",
  },
};

export const TRANSACTION_STATUS: Record<TxStatus, StatusCopy> = {
  PENDING: {
    label: "Pending",
    color: "yellow",
    description:
      "Payment has been created but not yet sent. Auto-approved payouts go out automatically; over-limit payouts wait for an admin.",
  },
  PAID: {
    label: "Paid",
    color: "green",
    description: "The payment has been sent to your payout method.",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "gray",
    description: "This payment was cancelled and won't be sent.",
  },
  REJECTED: {
    label: "Rejected",
    color: "red",
    description:
      "An admin rejected this payment — the reason is shown with the transaction.",
  },
  ON_HOLD: {
    label: "On hold",
    color: "orange",
    description:
      "The payment is paused because the task changed after completion. It resumes once the task is stable again.",
  },
};

export const WELCOME_PACK_ORDER_STATUS: Record<
  WelcomePackOrderStatus,
  StatusCopy
> = {
  PENDING: {
    label: "Pending",
    color: "yellow",
    description: "Your order is waiting for admin review.",
  },
  APPROVED: {
    label: "Approved",
    color: "blue",
    description: "Your order was approved and is being prepared.",
  },
  SHIPPED: {
    label: "Shipped",
    color: "indigo",
    description: "Your order is on its way — check the tracking details.",
  },
  DELIVERED: {
    label: "Delivered",
    color: "green",
    description: "Your order was delivered.",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "gray",
    description:
      "This order was cancelled. You can place a new order while the ordering window is open.",
  },
  REJECTED: {
    label: "Rejected",
    color: "red",
    description:
      "An admin rejected this order — the reason is shown with the order.",
  },
};

/**
 * Historical states only — DevHub stopped collecting identity documents when
 * the Xendit integration was removed. None of these may tell anyone to
 * resubmit or promise automated payouts: there is no form to resubmit on, and
 * no payout route an approval unlocks. Every payout is manual or Billplz now,
 * and neither ever required verification.
 */
export const KYC_STATUS: Record<KycStatus, StatusCopy> = {
  PENDING: {
    label: "Pending",
    color: "yellow",
    description:
      "Submitted before identity verification was retired. It will expire on its own; nothing is needed from you.",
  },
  APPROVED: {
    label: "Approved",
    color: "green",
    description:
      "Identity was verified. The result is kept as a compliance record; documents were deleted after review.",
  },
  REJECTED: {
    label: "Rejected",
    color: "red",
    description:
      "Verification did not pass. Nothing is needed from you — payouts no longer require it.",
  },
  EXPIRED: {
    label: "Expired",
    color: "orange",
    description:
      "Verification lapsed before it was reviewed. Nothing is needed from you — payouts no longer require it.",
  },
};
