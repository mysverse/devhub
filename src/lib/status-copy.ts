import type {
  BonusCandidateStatus,
  KycStatus,
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
    ELIGIBLE: { label: "Potential", color: "green" },
    READY_FOR_REVIEW: { label: "Review", color: "yellow" },
    APPROVED: { label: "Approved", color: "blue" },
    REJECTED: { label: "Rejected", color: "red" },
    INELIGIBLE: { label: "Ineligible", color: "gray" },
  };

export const PPT_REQUEST_STATUS: Record<PptRequestStatus, StatusCopy> = {
  PENDING: { label: "Pending", color: "yellow" },
  APPROVED: { label: "Approved", color: "green" },
  REJECTED: { label: "Rejected", color: "red" },
};

export const PPT_PAYOUT_STATUS: Record<PptPayoutStatus, StatusCopy> = {
  BLOCKED: { label: "Blocked", color: "red" },
  NEEDS_PROOF: { label: "Needs proof", color: "yellow" },
  WAITING_STABILITY: { label: "Waiting stability", color: "blue" },
  READY_FOR_PAYOUT: { label: "Ready for payout", color: "green" },
  TRANSACTION_PENDING: { label: "Transaction pending", color: "green" },
  ON_HOLD: { label: "On hold", color: "orange" },
  PAID: { label: "Paid", color: "green" },
  FLAGGED: { label: "Flagged", color: "red" },
};

export const TRANSACTION_STATUS: Record<TxStatus, StatusCopy> = {
  PENDING: { label: "Pending", color: "yellow" },
  PAID: { label: "Paid", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
  REJECTED: { label: "Rejected", color: "red" },
  ON_HOLD: { label: "On hold", color: "orange" },
};

export const WELCOME_PACK_ORDER_STATUS: Record<
  WelcomePackOrderStatus,
  StatusCopy
> = {
  PENDING: { label: "Pending", color: "yellow" },
  APPROVED: { label: "Approved", color: "blue" },
  SHIPPED: { label: "Shipped", color: "indigo" },
  DELIVERED: { label: "Delivered", color: "green" },
  CANCELLED: { label: "Cancelled", color: "gray" },
  REJECTED: { label: "Rejected", color: "red" },
};

export const KYC_STATUS: Record<KycStatus, StatusCopy> = {
  PENDING: { label: "Pending", color: "yellow" },
  APPROVED: { label: "Approved", color: "green" },
  REJECTED: { label: "Rejected", color: "red" },
  EXPIRED: { label: "Expired", color: "orange" },
};
