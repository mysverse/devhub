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
  paymentMethod: string;
  paypalEmail?: string | null;
  duitNowId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  robloxId?: string | null;
  robuxUsername?: string | null;
  linearIssueIdentifier?: string | null;
  linearIssueUrl?: string | null;
  email?: string | null;
  paidAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  autoApproved?: boolean;
  bonusLineItems?: {
    id: string;
    identifier?: string | null;
    title?: string | null;
    url?: string | null;
    amount?: number | null;
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
