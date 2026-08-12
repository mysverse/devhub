// The single catalog of every notification DevHub sends: what it is, who gets
// it, its default channels, and whether the recipient can turn it off.
// Consumed by the settings preferences UI, the help page's "what we'll notify
// you about" list, and the engine's channel defaults — one source, no drift.
//
// `configurable: true` requires the emit site to use notifyWithPreferences();
// plain notify() calls ignore preferences, so their entries must stay
// `configurable: false` (listed to users as "always sent").

export type NotificationChannelKey = "in_app" | "email" | "discord";

/**
 * in_app and email are universal; discord is opt-in per entry. Only
 * notifications that declare a discord default can be delivered — and
 * therefore configured — over Discord, so the settings page never renders a
 * toggle for a channel that will never carry that notification.
 */
export type NotificationChannelDefaultMap = {
  in_app: boolean;
  email: boolean;
  discord?: boolean;
};

export type NotificationCatalogEntry = {
  domain: string;
  type: string;
  audience: "developer" | "admin";
  title: string;
  description: string;
  defaults: NotificationChannelDefaultMap;
  /** False = always sent (emitted without preference checks). */
  configurable: boolean;
  /**
   * Who may re-send this email after a failed delivery.
   *
   * `"sweep"` — the generic reconciler may retry it, because everything the
   * email needs is on the Notification row (title, message, href).
   *
   * `"owned"` — only its own emit path may retry it. The email carries
   * something the Notification row cannot reconstruct, so a generic retry
   * would send a degraded version AND mark the delivery SENT, which then
   * blinds the real reconciler forever. `payment:PROCESSED` is the case:
   * `defaultEmail()` rebuilds attachments only from the options passed at emit
   * time, so a generic retry would send a payment confirmation with no PDF
   * slip and permanently hide it from sweepMissingPaymentConfirmations.
   *
   * Declared per entry rather than inferred, and required rather than
   * defaulted, for the same reason the preference allowlist is derived from
   * this catalog: a hand-written `if (domain === "payment")` in the sweep is
   * exactly the drift that has already bitten this codebase once.
   */
  emailRetry: "sweep" | "owned";
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
  {
    domain: "ppt",
    type: "READY",
    audience: "developer",
    title: "PPT payout on the way",
    description: "All checks passed and your payout was created.",
    defaults: { in_app: true, email: false },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "ppt",
    type: "PROOF_ACCEPTED",
    audience: "developer",
    title: "Proof accepted",
    description: "Your #ppt-proof comment was accepted.",
    defaults: { in_app: true, email: false },
    configurable: false,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    // The only "owned" entry: this email carries the PDF slip, which
    // defaultEmail() cannot rebuild from the Notification row.
    // sweepMissingPaymentConfirmations is its retry path.
    emailRetry: "owned",
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
    emailRetry: "sweep",
  },
  {
    domain: "payment",
    type: "REJECTED",
    audience: "developer",
    title: "Payment rejected",
    description: "An admin rejected a payment, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
  {
    domain: "incentive",
    type: "NEW_INCENTIVE",
    audience: "developer",
    title: "Incentive earned",
    description: "You earned a weekly incentive award, pending release.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "incentive",
    type: "INCENTIVE_DISPUTED",
    audience: "developer",
    title: "Incentive updated by admin",
    description: "An admin adjusted or disputed one of your incentive awards.",
    defaults: { in_app: true, email: false },
    configurable: false,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
  {
    domain: "kyc",
    type: "REJECTED",
    audience: "developer",
    title: "KYC rejected",
    description: "Verification failed, with the reason and how to resubmit.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
  {
    domain: "ppt_request",
    type: "REJECTED",
    audience: "developer",
    title: "PPT request rejected",
    description: "When an admin rejects one of your PPT requests.",
    defaults: { in_app: true, email: true },
    configurable: true,
    emailRetry: "sweep",
  },
  {
    domain: "ppt_request",
    type: "SUBMITTED",
    audience: "admin",
    title: "New PPT request",
    description: "Admin review notice when developers submit PPT requests.",
    defaults: { in_app: true, email: true },
    configurable: true,
    emailRetry: "sweep",
  },
  // ── PPT tasks & fairness (configurable) ──────────────────────────────────
  {
    domain: "ppt_task",
    type: "ASSIGNED_TO_YOU",
    audience: "developer",
    title: "PPT assigned to you",
    description: "When an approved PPT is assigned directly to you.",
    // Addressed to one person and expects action — the case a DM is for.
    defaults: { in_app: true, email: true, discord: true },
    configurable: true,
    emailRetry: "sweep",
  },
  {
    domain: "ppt_task",
    type: "UNCLAIMED_AVAILABLE",
    audience: "developer",
    title: "PPT open to claim",
    description:
      "When a PPT is approved as open, released, or returns to the board.",
    // Broadcast, so a DM would be noise by default — but opt-in is available.
    defaults: { in_app: true, email: false, discord: false },
    configurable: true,
    emailRetry: "sweep",
  },
  {
    domain: "ppt_task",
    type: "SUGGESTED_TO_YOU",
    audience: "developer",
    title: "A task picked out for you",
    description:
      "When an admin points you at a specific open task, with the reason it suits you.",
    // The whole point is that it reaches a person directly.
    defaults: { in_app: true, email: true, discord: true },
    configurable: true,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "SHIPPED",
    audience: "developer",
    title: "Welcome pack shipped",
    description: "Your order is on its way, with tracking.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "DELIVERED",
    audience: "developer",
    title: "Welcome pack delivered",
    description: "Your order arrived.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "DELAYED",
    audience: "developer",
    title: "Welcome pack delayed",
    description: "Your order hit a delay, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "REJECTED",
    audience: "developer",
    title: "Welcome pack order rejected",
    description: "An admin rejected your order, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "CANCELLED",
    audience: "developer",
    title: "Welcome pack order cancelled",
    description: "Your order was cancelled.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "welcome_pack",
    type: "ADMIN_CANCELLED",
    audience: "developer",
    title: "Welcome pack order cancelled by admin",
    description: "An admin cancelled your order, with the reason.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "payment",
    type: "ADMIN_PAYOUT_UNRECONCILED",
    audience: "admin",
    title: "Payout needs manual reconciliation",
    description:
      "A payout has been in flight too long and no automated poll can resolve it — the provider has to be checked by hand before anyone re-sends.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  // ── Admin alerts (always sent — these are how an admin learns something
  //    broke). They were emitted without catalog entries, which meant the
  //    settings page never listed them and, more importantly, the email retry
  //    sweep treated them as unknown and skipped them: the alerts that say
  //    something is wrong were the ones least likely to be re-sent. ─────────
  {
    domain: "ppt",
    type: "ADMIN_ALERT",
    audience: "admin",
    title: "PPT payout needs an admin",
    description:
      "A PPT payout is blocked, flagged, or waiting on a decision only an admin can make.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "incentive",
    type: "ADMIN_ALERT",
    audience: "admin",
    title: "Incentive run needs an admin",
    description:
      "An incentive award or release needs attention — a cap, an anomaly, or a failed run.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "admin_notice",
    type: "PPT_AUTO_UNASSIGNED",
    audience: "admin",
    title: "Task auto-unassigned",
    description:
      "A stale assignment passed its deadline and DevHub unassigned it in Linear.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
  },
  {
    domain: "admin_notice",
    type: "LINEAR_SERVICE_KEY_FAILED",
    audience: "admin",
    title: "Linear service key failed",
    description:
      "The shared Linear credential stopped working — background syncs are degraded until it is replaced.",
    defaults: { in_app: true, email: true },
    configurable: false,
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
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
    emailRetry: "sweep",
  },
];

/** Channels every entry supports. Discord is declared per entry. */
export const NOTIFICATION_CHANNEL_KEYS: NotificationChannelKey[] = [
  "in_app",
  "email",
];

/** Channels this entry can actually be delivered on. */
export function channelsForEntry(
  entry: NotificationCatalogEntry,
): NotificationChannelKey[] {
  return entry.defaults.discord === undefined
    ? NOTIFICATION_CHANNEL_KEYS
    : [...NOTIFICATION_CHANNEL_KEYS, "discord"];
}

/**
 * Every "domain:type:channel" a developer is allowed to set a preference for,
 * derived from the catalog rather than restated.
 *
 * The settings UI renders a toggle for every `configurable: true` entry, but
 * the save action used to check against a hand-written allowlist covering
 * five of them. The other toggles rendered, moved, and were silently rejected
 * on save — mute switches that did nothing. Deriving both sides from one
 * source means a new configurable entry can't ship half-wired.
 */
export function configurablePreferenceKeys(): Set<string> {
  const keys = new Set<string>();
  for (const entry of NOTIFICATION_CATALOG) {
    if (!entry.configurable) continue;
    for (const channel of channelsForEntry(entry)) {
      keys.add(`${entry.domain}:${entry.type}:${channel}`);
    }
  }
  return keys;
}

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
