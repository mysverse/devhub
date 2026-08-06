// The single catalog of every notification DevHub sends: what it is, who gets
// it, its default channels, and whether the recipient can turn it off.
// Consumed by the settings preferences UI, the help page's "what we'll notify
// you about" list, and the engine's channel defaults — one source, no drift.
//
// `configurable: true` requires the emit site to use notifyWithPreferences();
// plain notify() calls ignore preferences, so their entries must stay
// `configurable: false` (listed to users as "always sent").

export type NotificationChannelKey = "in_app" | "email";

export type NotificationCatalogEntry = {
  domain: string;
  type: string;
  audience: "developer" | "admin";
  title: string;
  description: string;
  defaults: Record<NotificationChannelKey, boolean>;
  /** False = always sent (emitted without preference checks). */
  configurable: boolean;
};

export const NOTIFICATION_CATALOG: NotificationCatalogEntry[] = [
  // ── PPT payout state (always sent — money-critical) ──────────────────────
  {
    domain: "ppt",
    type: "BLOCKED",
    audience: "developer",
    title: "PPT payout blocked",
    description:
      "Something prevents payout on a completed task — includes the reason and your next step.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "ppt",
    type: "HELD",
    audience: "developer",
    title: "PPT payout held",
    description:
      "A task changed after completion (reopened, relabeled, reassigned), pausing its payout.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "ppt",
    type: "READY",
    audience: "developer",
    title: "PPT payout on the way",
    description: "All checks passed and your payout was created.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  {
    domain: "ppt",
    type: "PROOF_ACCEPTED",
    audience: "developer",
    title: "Proof accepted",
    description: "Your #ppt-proof comment was accepted.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  {
    domain: "ppt",
    type: "PAID_REOPENED",
    audience: "developer",
    title: "Paid task reopened",
    description:
      "A task DevHub already paid was reopened or changed — admins review what happens next.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  // ── Payments (always sent) ───────────────────────────────────────────────
  {
    domain: "payment",
    type: "PROCESSED",
    audience: "developer",
    title: "Payment sent",
    description: "A payment went out to your payout method, with the slip.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "payment",
    type: "AWAITING_REVIEW",
    audience: "developer",
    title: "Payout awaiting admin review",
    description:
      "A payout passed every check but is over your weekly auto-approval limit, so an admin releases it manually.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "payment",
    type: "REJECTED",
    audience: "developer",
    title: "Payment rejected",
    description: "An admin rejected a payment, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  // ── Bonuses & incentives ─────────────────────────────────────────────────
  {
    domain: "bonus",
    type: "NEW_ELIGIBLE_BONUS",
    audience: "developer",
    title: "New potential bonus",
    description:
      "A task of yours qualified as a bonus candidate (amount not guaranteed until admin review).",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  {
    domain: "incentive",
    type: "NEW_INCENTIVE",
    audience: "developer",
    title: "Incentive earned",
    description: "You earned a weekly incentive award, pending release.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "incentive",
    type: "INCENTIVE_DISPUTED",
    audience: "developer",
    title: "Incentive updated by admin",
    description: "An admin adjusted or disputed one of your incentive awards.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  // ── KYC (always sent — compliance) ───────────────────────────────────────
  {
    domain: "kyc",
    type: "APPROVED",
    audience: "developer",
    title: "KYC approved",
    description: "Your identity verification passed.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "kyc",
    type: "REJECTED",
    audience: "developer",
    title: "KYC rejected",
    description: "Verification failed, with the reason and how to resubmit.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  // ── PPT requests (configurable) ──────────────────────────────────────────
  {
    domain: "ppt_request",
    type: "APPROVED",
    audience: "developer",
    title: "PPT request approved",
    description: "When an admin approves one of your PPT requests.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_request",
    type: "REJECTED",
    audience: "developer",
    title: "PPT request rejected",
    description: "When an admin rejects one of your PPT requests.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_request",
    type: "SUBMITTED",
    audience: "admin",
    title: "New PPT request",
    description: "Admin review notice when developers submit PPT requests.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  // ── PPT tasks & fairness (configurable) ──────────────────────────────────
  {
    domain: "ppt_task",
    type: "ASSIGNED_TO_YOU",
    audience: "developer",
    title: "PPT assigned to you",
    description: "When an approved PPT is assigned directly to you.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "UNCLAIMED_AVAILABLE",
    audience: "developer",
    title: "PPT open to claim",
    description:
      "When a PPT is approved as open, released, or returns to the board.",
    defaults: { in_app: true, email: false },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "IDLE_NUDGE",
    audience: "developer",
    title: "Gentle activity nudge",
    description:
      "A quiet in-app heads-up when a claimed task has been idle for a day — well before the formal reminder.",
    defaults: { in_app: true, email: false },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "STALE_WARNING",
    audience: "developer",
    title: "PPT activity reminder",
    description:
      "When an assigned PPT has no visible activity for the warning window.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "AUTO_UNASSIGNED",
    audience: "developer",
    title: "PPT returned to board",
    description:
      "When DevHub releases a stale assignment back to the board (you can reclaim it).",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "BLOCK_EXPIRED",
    audience: "developer",
    title: "Blocked window ended",
    description:
      "When a task you marked blocked auto-resumes its activity timer.",
    defaults: { in_app: true, email: false },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "REASSIGNED_AWAY",
    audience: "developer",
    title: "Task taken over",
    description:
      "When another developer takes over a task assigned to you, with their reason.",
    defaults: { in_app: true, email: true },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "OPEN_TASKS_DIGEST",
    audience: "developer",
    title: "Weekly open-tasks digest",
    description:
      "A weekly email with open PPTs worth claiming — only sent when you have no active tasks.",
    defaults: { in_app: false, email: true },
    configurable: true,
  },
  {
    domain: "ppt_task",
    type: "BLOCKED_REPORTED",
    audience: "admin",
    title: "Repeatedly blocked PPT",
    description:
      "Admin notice when a developer marks the same task blocked multiple times and may need help.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  // ── Welcome pack (always sent) ───────────────────────────────────────────
  {
    domain: "welcome_pack",
    type: "APPROVED",
    audience: "developer",
    title: "Welcome pack order approved",
    description: "Your order was approved and is being prepared.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "SHIPPED",
    audience: "developer",
    title: "Welcome pack shipped",
    description: "Your order is on its way, with tracking.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "DELIVERED",
    audience: "developer",
    title: "Welcome pack delivered",
    description: "Your order arrived.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "DELAYED",
    audience: "developer",
    title: "Welcome pack delayed",
    description: "Your order hit a delay, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "REJECTED",
    audience: "developer",
    title: "Welcome pack order rejected",
    description: "An admin rejected your order, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "CANCELLED",
    audience: "developer",
    title: "Welcome pack order cancelled",
    description: "Your order was cancelled.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "welcome_pack",
    type: "ADMIN_CANCELLED",
    audience: "developer",
    title: "Welcome pack order cancelled by admin",
    description: "An admin cancelled your order, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  // ── Payout campaigns (always sent — this is money on the table) ──────────
  {
    domain: "campaign",
    type: "STARTED",
    audience: "developer",
    title: "Payout multiplier started",
    description:
      "A limited-time campaign is paying more than the normal rate — what it boosts, and when it ends.",
    defaults: { in_app: true, email: true },
    configurable: false,
  },
  {
    domain: "campaign",
    type: "ENDING_SOON",
    audience: "developer",
    title: "Payout multiplier ending",
    description:
      "A reminder roughly two days before a campaign ends, so nothing you are close to finishing misses it.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  {
    domain: "campaign",
    type: "ENDED",
    audience: "developer",
    title: "Payout multiplier ended",
    description:
      "A wrap-up of what a finished campaign paid you on top of the normal rate.",
    defaults: { in_app: true, email: false },
    configurable: false,
  },
  // ── Recognition (in-app only, deliberately quiet) ────────────────────────
  {
    domain: "recognition",
    type: "ACHIEVEMENT",
    audience: "developer",
    title: "Achievements",
    description:
      "In-app celebrations for milestones like your first proof, first payout, and completion streaks. Never emailed.",
    defaults: { in_app: true, email: false },
    configurable: true,
  },
];

/** Channel defaults derived from the catalog, keyed "domain:type". */
export function catalogChannelDefaults(): Record<
  string,
  Partial<Record<NotificationChannelKey, boolean>>
> {
  return Object.fromEntries(
    NOTIFICATION_CATALOG.map((entry) => [
      `${entry.domain}:${entry.type}`,
      entry.defaults,
    ]),
  );
}
