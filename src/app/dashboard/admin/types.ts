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
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  robloxId: string | null;
  robuxUsername: string | null;
  email: string | null;
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
  linearIssueUrl?: string | null;
  paidAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  autoApproved?: boolean;
  proofStatus?: string | null;
  proofReason?: string | null;
  proofCommentUrl?: string | null;
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
  xenditEnabled?: boolean;
};
