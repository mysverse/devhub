export type NotificationPresentation = {
  heading: string;
  color: string;
  tone: "positive" | "warning" | "critical" | "info";
  /** Short human label for the specific event, shown as a chip in toasts and
   * the inbox. Optional — surfaces must hide the chip when absent rather than
   * falling back to the raw type string. */
  typeLabel?: string;
};

const DOMAIN_COPY: Record<string, NotificationPresentation> = {
  ppt: { heading: "PPT payout update", color: "blue", tone: "info" },
  bonus: { heading: "Potential bonus", color: "green", tone: "positive" },
  incentive: { heading: "Incentive update", color: "blue", tone: "info" },
  welcome_pack: {
    heading: "Welcome pack update",
    color: "indigo",
    tone: "info",
  },
  payment: { heading: "Payment update", color: "blue", tone: "info" },
  kyc: { heading: "KYC update", color: "blue", tone: "info" },
  ppt_request: { heading: "PPT request update", color: "blue", tone: "info" },
  ppt_task: { heading: "PPT task update", color: "blue", tone: "info" },
  admin_notice: {
    heading: "Action required",
    color: "yellow",
    tone: "warning",
  },
  recognition: { heading: "Nice work", color: "teal", tone: "positive" },
  campaign: {
    heading: "Payout campaign",
    color: "violet",
    tone: "positive",
  },
};

export const TYPE_OVERRIDES: Record<
  string,
  Partial<NotificationPresentation>
> = {
  "ppt:BLOCKED": {
    color: "red",
    tone: "critical",
    typeLabel: "Payout blocked",
  },
  "ppt:HELD": { color: "yellow", tone: "warning", typeLabel: "Payout held" },
  "ppt:READY": { color: "green", tone: "positive", typeLabel: "Payout ready" },
  "ppt:PROOF_ACCEPTED": {
    color: "green",
    tone: "positive",
    typeLabel: "Proof accepted",
  },
  "ppt:PAID_REOPENED": {
    color: "red",
    tone: "critical",
    typeLabel: "Paid task reopened",
  },
  "incentive:INCENTIVE_DISPUTED": {
    color: "orange",
    tone: "warning",
    typeLabel: "Updated by admin",
  },
  "welcome_pack:REJECTED": {
    color: "red",
    tone: "critical",
    typeLabel: "Rejected",
  },
  "welcome_pack:CANCELLED": {
    color: "gray",
    tone: "warning",
    typeLabel: "Cancelled",
  },
  "welcome_pack:ADMIN_CANCELLED": {
    color: "gray",
    tone: "warning",
    typeLabel: "Cancelled",
  },
  "welcome_pack:APPROVED": {
    color: "green",
    tone: "positive",
    typeLabel: "Approved",
  },
  "welcome_pack:SHIPPED": {
    color: "indigo",
    tone: "positive",
    typeLabel: "Shipped",
  },
  "welcome_pack:DELIVERED": {
    color: "green",
    tone: "positive",
    typeLabel: "Delivered",
  },
  "welcome_pack:DELAYED": {
    color: "orange",
    tone: "warning",
    typeLabel: "Delayed",
  },
  "payment:PROCESSED": {
    color: "green",
    tone: "positive",
    typeLabel: "Payment sent",
  },
  "payment:AWAITING_REVIEW": {
    color: "yellow",
    tone: "warning",
    typeLabel: "Awaiting review",
  },
  "payment:REJECTED": {
    color: "red",
    tone: "critical",
    typeLabel: "Payment rejected",
  },
  "kyc:APPROVED": { color: "green", tone: "positive", typeLabel: "Approved" },
  "kyc:REJECTED": { color: "red", tone: "critical", typeLabel: "Rejected" },
  "ppt_request:APPROVED": {
    color: "green",
    tone: "positive",
    typeLabel: "Approved",
  },
  "ppt_request:REJECTED": {
    color: "red",
    tone: "critical",
    typeLabel: "Rejected",
  },
  "ppt_request:SUBMITTED": {
    color: "blue",
    tone: "info",
    typeLabel: "Submitted",
  },
  "ppt_task:ASSIGNED_TO_YOU": {
    color: "green",
    tone: "positive",
    typeLabel: "Assigned to you",
  },
  "ppt_task:UNCLAIMED_AVAILABLE": {
    color: "blue",
    tone: "info",
    typeLabel: "Open to claim",
  },
  "ppt_task:STALE_WARNING": {
    color: "yellow",
    tone: "warning",
    typeLabel: "Activity reminder",
  },
  "ppt_task:AUTO_UNASSIGNED": {
    color: "orange",
    tone: "warning",
    typeLabel: "Returned to board",
  },
  "ppt_task:IDLE_NUDGE": {
    color: "blue",
    tone: "info",
    typeLabel: "Gentle nudge",
  },
  "ppt_task:BLOCK_EXPIRED": {
    color: "blue",
    tone: "info",
    typeLabel: "Block ended",
  },
  "ppt_task:BLOCKED_REPORTED": {
    color: "yellow",
    tone: "warning",
    typeLabel: "Needs unblocking",
  },
  "ppt_task:REASSIGNED_AWAY": {
    color: "orange",
    tone: "warning",
    typeLabel: "Taken over",
  },
  "campaign:STARTED": {
    color: "violet",
    tone: "positive",
    typeLabel: "Multiplier live",
  },
  "campaign:ENDING_SOON": {
    color: "orange",
    tone: "warning",
    typeLabel: "Ending soon",
  },
  "campaign:ENDED": {
    color: "gray",
    tone: "info",
    typeLabel: "Campaign ended",
  },
};

export function notificationPresentation(
  domain: string,
  type: string,
): NotificationPresentation {
  const base = DOMAIN_COPY[domain] ?? {
    heading: "DevHub update",
    color: "blue",
    tone: "info" as const,
  };
  const override = TYPE_OVERRIDES[`${domain}:${type}`] ?? {};
  return { ...base, ...override };
}
