export type NotificationPresentation = {
  heading: string;
  color: string;
  tone: "positive" | "warning" | "critical" | "info";
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
};

const TYPE_OVERRIDES: Record<string, Partial<NotificationPresentation>> = {
  "ppt:BLOCKED": { color: "red", tone: "critical" },
  "ppt:HELD": { color: "yellow", tone: "warning" },
  "ppt:READY": { color: "green", tone: "positive" },
  "ppt:PROOF_ACCEPTED": { color: "green", tone: "positive" },
  "ppt:PAID_REOPENED": { color: "red", tone: "critical" },
  "incentive:INCENTIVE_DISPUTED": { color: "orange", tone: "warning" },
  "welcome_pack:REJECTED": { color: "red", tone: "critical" },
  "welcome_pack:CANCELLED": { color: "gray", tone: "warning" },
  "welcome_pack:ADMIN_CANCELLED": { color: "gray", tone: "warning" },
  "welcome_pack:APPROVED": { color: "green", tone: "positive" },
  "welcome_pack:SHIPPED": { color: "indigo", tone: "positive" },
  "welcome_pack:DELIVERED": { color: "green", tone: "positive" },
  "welcome_pack:DELAYED": { color: "orange", tone: "warning" },
  "payment:PROCESSED": { color: "green", tone: "positive" },
  "payment:REJECTED": { color: "red", tone: "critical" },
  "kyc:APPROVED": { color: "green", tone: "positive" },
  "kyc:REJECTED": { color: "red", tone: "critical" },
  "ppt_request:APPROVED": { color: "green", tone: "positive" },
  "ppt_request:REJECTED": { color: "red", tone: "critical" },
  "ppt_request:SUBMITTED": { color: "blue", tone: "info" },
  "ppt_task:ASSIGNED_TO_YOU": { color: "green", tone: "positive" },
  "ppt_task:UNCLAIMED_AVAILABLE": { color: "blue", tone: "info" },
  "ppt_task:STALE_WARNING": { color: "yellow", tone: "warning" },
  "ppt_task:AUTO_UNASSIGNED": { color: "red", tone: "critical" },
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
