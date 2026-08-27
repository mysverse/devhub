import type { DuitNowIdType } from "@/lib/duitnow-id";

/**
 * The payment rails an admin needs to actually send money, plus the address to
 * contact the developer about a problem. Nested rather than flattened onto
 * PayoutTransaction on purpose: settled rows carry `paymentDetails: null`, and
 * a nested object makes every read a compile error when it is absent. Optional
 * flat fields would let a future edit read redacted data and stay silent.
 */
export type PayoutPaymentDetails = {
  paypalEmail: string | null;
  duitNowId: string | null;
  /** Required, not optional — see the note above about silent absence. */
  duitNowIdType: DuitNowIdType | null;
  duitNowIdStatus: string;
  duitNowIdCheckedAt: string | null;
  duitNowIdIssue: string | null;
  /** ISO 3166-1 alpha-2; the bank asks for it before a passport number. */
  duitNowIdCountry: string | null;
  /** Where the developer says the proxy is linked — a claim, not a lookup. */
  duitNowIdInstitution: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  robloxId: string | null;
  robuxUsername: string | null;
  email: string | null;
};

/**
 * A PROOF attachment an assignee posted alongside their #ppt-proof comment.
 *
 * Deliberately no `linearAssetUrl`: Linear's asset host needs a bearer token,
 * so the only URL that renders in a browser is `/api/ppt-attachments/<id>`,
 * which re-checks the viewer. Shipping the raw URL would tempt a future edit
 * into an <img> that silently 401s.
 */
export type ProofAttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
};

export type PayoutTransaction = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  source?: string;
  bonusPeriod?: string | null;
  taskTitle: string;
  developerName: string;
  /** A label, not PII — kept at the top level so settled rows still show it. */
  paymentMethod: string;
  /**
   * null for PAID/REJECTED rows: settled payouts have no operational need for
   * bank details, and the columns are never queried for those tabs.
   */
  paymentDetails: PayoutPaymentDetails | null;
  linearIssueIdentifier?: string | null;
  /** Keys the on-demand proof summary; the server re-reads everything else. */
  linearIssueId?: string | null;
  linearIssueUrl?: string | null;
  paidAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  autoApproved?: boolean;
  proofStatus?: string | null;
  proofReason?: string | null;
  proofCommentUrl?: string | null;
  /**
   * The proof comment itself, so an admin can judge it without leaving the
   * board. Developer-authored free text — admin surfaces only; it must never
   * be mapped into a DTO another developer can read.
   */
  proofBody?: string | null;
  proofAttachments?: ProofAttachmentSummary[];
  bonusLineItems?: {
    id: string;
    identifier?: string | null;
    title?: string | null;
    url?: string | null;
    amount?: number | null;
  }[];
  incentiveLineItems?: {
    id: string;
    type: string;
    period: string;
    amount: number;
    netAmount?: number | null;
    status: string;
  }[];
  payout?: {
    id: string;
    provider: string;
    status: string;
    errorMessage?: string | null;
  } | null;
  creditLimitUsage?: {
    used: number;
    limit: number;
    remaining: number;
  } | null;
};
