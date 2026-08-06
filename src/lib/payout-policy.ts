import { type CurrencyCode, formatAmount } from "./currency";

// Client-safe single source of truth for every "explained number" in the app:
// weekly credit limits, the payout stability window, assignment-watch
// thresholds, and proof requirements — plus the copy helpers and glossary that
// reference them. UI, help drawers, onboarding, and emails must all describe
// these rules through this module so displayed numbers can never drift from
// the enforced ones.
//
// Env overrides (PPT_STABILITY_MINUTES, PPT_HOGGING_WARNING_HOURS,
// PPT_HOGGING_UNASSIGN_HOURS, PPT_HOGGING_SNOOZE_HOURS) are resolved
// server-side in payout-policy-server.ts and threaded to client components as
// props; the DEFAULT_* constants here are the fallbacks the server resolvers
// share with client-only surfaces.

/** The proof marker developers must include in their Linear proof comment. */
export const PROOF_TAG = "#ppt-proof";

/**
 * Weekly credit limits per currency.
 * Transactions within these limits are auto-approved.
 * Set to 0 to disable auto-approval for a currency.
 */
export const WEEKLY_CREDIT_LIMITS: Record<CurrencyCode, number> = {
  MYR: 100,
  ROBUX: 6000, // Complexity level 5 at 1,200 Robux each
};

export const DEFAULT_STABILITY_MINUTES = 60;
export const DEFAULT_WARN_HOURS = 48;
export const DEFAULT_UNASSIGN_HOURS = 72;
export const DEFAULT_SNOOZE_HOURS = 72;
/** Hours of idle time before the gentle in-app-only nudge (pre-warning). */
export const DEFAULT_IDLE_NUDGE_HOURS = 24;
/** How long a self-service "I'm blocked" pause lasts before auto-expiring. */
export const DEFAULT_SELF_BLOCK_HOURS = 72;
/** Minimum meaningful characters for a #ppt-proof comment posted in Linear. */
export const PROOF_MIN_CHARS = 40;
/** Minimum characters for proof submitted through DevHub's Proof button. */
export const PROOF_BUTTON_MIN_CHARS = 20;

export type PayoutPolicy = {
  stabilityMinutes: number;
  warnHours: number;
  unassignHours: number;
  snoozeHours: number;
  idleNudgeHours: number;
  selfBlockHours: number;
};

export const DEFAULT_PAYOUT_POLICY: PayoutPolicy = {
  stabilityMinutes: DEFAULT_STABILITY_MINUTES,
  warnHours: DEFAULT_WARN_HOURS,
  unassignHours: DEFAULT_UNASSIGN_HOURS,
  snoozeHours: DEFAULT_SNOOZE_HOURS,
  idleNudgeHours: DEFAULT_IDLE_NUDGE_HOURS,
  selfBlockHours: DEFAULT_SELF_BLOCK_HOURS,
};

export function describeCreditLimit(currency: CurrencyCode): string {
  const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
  if (limit <= 0) {
    return "Payouts in this currency are released manually by an admin.";
  }
  return `Payouts up to ${formatAmount(limit, currency)} per week are approved automatically. Anything past that isn't lost — it waits for an admin to release it manually.`;
}

export function describeWeekBounds(): string {
  return "Weeks run Monday to Sunday (UTC); your limit resets every Monday at 00:00 UTC.";
}

export function describeStabilityWindow(
  stabilityMinutes: number = DEFAULT_STABILITY_MINUTES,
): string {
  return `After a task is marked Done it must stay Done for ${stabilityMinutes} minutes before payment is created. This happens automatically — you don't need to do anything.`;
}

export function describeWatchPolicy(
  policy: Pick<PayoutPolicy, "warnHours" | "unassignHours"> = {
    warnHours: DEFAULT_WARN_HOURS,
    unassignHours: DEFAULT_UNASSIGN_HOURS,
  },
): string {
  return `Claimed tasks with no visible activity get a reminder after ${policy.warnHours} hours and are returned to the board after ${policy.unassignHours} hours, so work never gets stuck. Posting a progress note resets the timer.`;
}

export function describeProofRequirement(): string {
  return `Before payout, post a ${PROOF_TAG} comment on the Linear issue covering what changed, proof links or screenshots, where it is implemented, and how it was verified.`;
}

/** Human labels for the self-block reasons (PptSelfBlockReason enum). */
export const SELF_BLOCK_REASON_LABELS: Record<string, string> = {
  WAITING_REVIEW: "Waiting on a review",
  WAITING_ASSETS: "Waiting on assets or designs",
  WAITING_DEPENDENCY: "Waiting on another task or person",
  OTHER: "Waiting on something else",
};

export type GlossaryEntry = {
  term: string;
  definition: string;
};

/**
 * Plain-language definitions for DevHub's domain terms, keyed for use with
 * `<InfoTip term="..." />` and the help page glossary. Definitions that
 * involve tunable numbers come from `buildGlossary(policy)` so copy follows
 * env overrides; `GLOSSARY` uses the defaults.
 */
export function buildGlossary(
  policy: PayoutPolicy = DEFAULT_PAYOUT_POLICY,
): Record<string, GlossaryEntry> {
  return {
    ppt: {
      term: "PPT (Pay Per Task)",
      definition:
        "A Linear task labeled PPT. Completing it — with proof — pays out its estimate points at your per-point rate.",
    },
    points: {
      term: "Points (estimate)",
      definition:
        "The task's complexity estimate in Linear, from 1 to 5. Each point pays a fixed rate based on your payout currency.",
    },
    proof: {
      term: "Proof",
      definition: describeProofRequirement(),
    },
    stabilityWindow: {
      term: "Stability window",
      definition: describeStabilityWindow(policy.stabilityMinutes),
    },
    weeklyCredit: {
      term: "Weekly credit limit",
      definition: `A weekly cap on how much PPT payout is approved automatically. Over-limit payouts aren't lost — they wait for an admin to release them manually. ${describeWeekBounds()}`,
    },
    assignmentWatch: {
      term: "Assignment watch",
      definition: describeWatchPolicy(policy),
    },
    incentive: {
      term: "Incentive",
      definition:
        "Automatic weekly rewards for qualifying completed tasks — streaks, milestones, and leaderboard awards. Separate from bonuses.",
    },
    bonus: {
      term: "Bonus",
      definition:
        "A non-guaranteed monthly payout for eligible non-PPT Linear work. Admins review candidates monthly and decide the final amount, up to each task's cap.",
    },
    campaign: {
      term: "Payout campaign",
      definition:
        "A limited-time multiplier (for example 2x or 3x) on payouts, running between a fixed start and end. The multiplier is locked in when your payout becomes eligible, so it still pays the promoted rate even if the campaign ends before the money goes out. Campaigns never stack — if two apply, you get the higher one.",
    },
  };
}

export const GLOSSARY = buildGlossary();

export type GlossaryKey = keyof ReturnType<typeof buildGlossary>;
