import type { IncentiveAwardStatus } from "@prisma/client";
import { type CurrencyCode, formatAmount } from "@/lib/currency";

// Client-safe copy + pure view-model builders shared across the incentive
// surfaces (engine, developer card, admin tab, drawers, transactions list).
//
// This module MUST stay free of `prisma` and `@/lib/incentives` (server-only)
// so it can be imported from both server and client components. It only depends
// on `@/lib/currency` and type-only Prisma enums.

// ---------------------------------------------------------------------------
// Award status copy
// ---------------------------------------------------------------------------

export type IncentiveStatusCopy = {
  label: string;
  description: string;
  /** Mantine color name: green | orange | red | blue | yellow | gray */
  color: string;
};

/**
 * Human-readable label + short description + tone for an award status.
 * Wording stays aligned with the IncentiveEarned email ("Held for review",
 * "Pending release"). Falls back gracefully for unknown/future values.
 */
export function incentiveStatusCopy(
  status: IncentiveAwardStatus | string,
): IncentiveStatusCopy {
  switch (status) {
    case "PENDING":
      return {
        label: "Pending release",
        description:
          "Approved and waiting out the review window before payout.",
        color: "yellow",
      };
    case "HELD":
      return {
        label: "Held for review",
        description:
          "Flagged for an admin to review before it can be released.",
        color: "orange",
      };
    case "RELEASING":
      return {
        label: "Processing",
        description: "Being prepared for payout right now.",
        color: "blue",
      };
    case "TRANSACTION_PENDING":
      return {
        label: "Awaiting payout",
        description: "A payout has been created and is on its way.",
        color: "blue",
      };
    case "PAID":
      return {
        label: "Paid",
        description: "Paid out to you.",
        color: "green",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        description: "Cancelled and will not be paid.",
        color: "red",
      };
    case "CLAWBACK_REQUESTED":
      return {
        label: "Clawback requested",
        description: "An admin has requested this award back.",
        color: "orange",
      };
    case "SETTLED_BY_CLAWBACK":
      return {
        label: "Applied to clawback",
        description:
          "Used to offset an earlier clawback instead of being paid.",
        color: "green",
      };
    default:
      return {
        label: String(status).replaceAll("_", " "),
        description: "",
        color: "gray",
      };
  }
}

// ---------------------------------------------------------------------------
// Guardrail held-reason copy
// ---------------------------------------------------------------------------

export type IncentiveHeldReasonCopy = { title: string; explanation: string };

/** Plain-language explanation for a guardrail hold reason. */
export function incentiveHeldReasonCopy(
  reason: string | null | undefined,
): IncentiveHeldReasonCopy {
  switch (reason) {
    case "over_weekly_cap":
      return {
        title: "Over weekly cap",
        explanation:
          "Paying this award would push the developer past the per-user weekly cap.",
      };
    case "over_monthly_cap":
      return {
        title: "Over monthly cap",
        explanation:
          "Paying this award would push the developer past the per-user monthly cap.",
      };
    case "over_weekly_budget":
      return {
        title: "Over weekly program budget",
        explanation:
          "Paying this award would exceed the program-wide weekly budget.",
      };
    case "over_monthly_budget":
      return {
        title: "Over monthly program budget",
        explanation:
          "Paying this award would exceed the program-wide monthly budget.",
      };
    case "anomaly":
      return {
        title: "Unusual activity",
        explanation:
          "This week's qualifying count is far above the developer's recent baseline.",
      };
    case "no_estimate_ratio":
      return {
        title: "Too many unestimated issues",
        explanation:
          "A large share of the developer's completed issues had no estimate.",
      };
    case "issue_invalidated":
      return {
        title: "Counted issue changed",
        explanation:
          "A counted issue was reopened, cancelled, reassigned, or archived after the award was created.",
      };
    default:
      return {
        title: "Held for review",
        explanation: "Awaiting an admin review before release.",
      };
  }
}

// ---------------------------------------------------------------------------
// Earning potential
// ---------------------------------------------------------------------------

export type IncentiveEarningPotential = {
  currency: CurrencyCode;
  /** Max achievable weekly amount (top tier + active-day kicker when enabled). */
  potentialAmount: number;
  potentialAmountFormatted: string;
  baseAmountFormatted: string;
  thresholdReached: boolean;
  kickerEnabled: boolean;
  kickerEligible: boolean;
  /** Kicker amount to chase when enabled but not yet eligible; null otherwise. */
  kickerContingencyFormatted: string | null;
};

export function buildIncentiveEarningPotential(input: {
  currency: CurrencyCode;
  topTierAmount: number;
  thresholdReached: boolean;
  kickerEnabled: boolean;
  kickerEligible: boolean;
  kickerAmount: number;
}): IncentiveEarningPotential {
  const potentialAmount =
    input.topTierAmount + (input.kickerEnabled ? input.kickerAmount : 0);
  return {
    currency: input.currency,
    potentialAmount,
    potentialAmountFormatted: formatAmount(potentialAmount, input.currency),
    baseAmountFormatted: formatAmount(input.topTierAmount, input.currency),
    thresholdReached: input.thresholdReached,
    kickerEnabled: input.kickerEnabled,
    kickerEligible: input.kickerEligible,
    kickerContingencyFormatted:
      input.kickerEnabled && !input.kickerEligible
        ? formatAmount(input.kickerAmount, input.currency)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Next targets (weekly + streak + milestone)
// ---------------------------------------------------------------------------

export type IncentiveNextTarget = {
  kind: "weekly" | "streak" | "milestone";
  label: string;
  detail: string;
  amountFormatted: string;
  remaining: number;
};

export function buildIncentiveNextTargets(input: {
  currency: CurrencyCode;
  completedThisWeek: number;
  weekly: {
    enabled: boolean;
    nextThreshold: number | null;
    nextAmount: number | null;
  };
  streak: {
    enabled: boolean;
    thresholdWeeks: number;
    currentStreakWeeks: number;
    amount: number;
  };
  milestone: {
    enabled: boolean;
    nextCount: number | null;
    amount: number | null;
    lifetimeCompleted: number;
  };
}): IncentiveNextTarget[] {
  const targets: IncentiveNextTarget[] = [];
  const { currency } = input;

  if (
    input.weekly.enabled &&
    input.weekly.nextThreshold != null &&
    input.weekly.nextAmount != null
  ) {
    const remaining = Math.max(
      0,
      input.weekly.nextThreshold - input.completedThisWeek,
    );
    if (remaining > 0) {
      const amountFormatted = formatAmount(input.weekly.nextAmount, currency);
      targets.push({
        kind: "weekly",
        label: `${remaining} qualifying ${remaining === 1 ? "task" : "tasks"} to ${amountFormatted}`,
        detail: "Weekly throughput reward",
        amountFormatted,
        remaining,
      });
    }
  }

  if (
    input.streak.enabled &&
    input.streak.thresholdWeeks > 0 &&
    input.streak.amount > 0
  ) {
    const remaining =
      input.streak.thresholdWeeks -
      (input.streak.currentStreakWeeks % input.streak.thresholdWeeks);
    const amountFormatted = formatAmount(input.streak.amount, currency);
    targets.push({
      kind: "streak",
      label: `Hit your weekly target ${remaining} more ${remaining === 1 ? "week" : "weeks"} for ${amountFormatted}`,
      detail: "Streak bonus",
      amountFormatted,
      remaining,
    });
  }

  if (
    input.milestone.enabled &&
    input.milestone.nextCount != null &&
    input.milestone.amount != null
  ) {
    const remaining = Math.max(
      0,
      input.milestone.nextCount - input.milestone.lifetimeCompleted,
    );
    if (remaining > 0) {
      const amountFormatted = formatAmount(input.milestone.amount, currency);
      targets.push({
        kind: "milestone",
        label: `${remaining} more to the ${input.milestone.nextCount}-task milestone (${amountFormatted})`,
        detail: "Lifetime milestone",
        amountFormatted,
        remaining,
      });
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type IncentiveSuggestion = {
  id: string;
  tone: "progress" | "streak" | "pending" | "info";
  title: string;
  detail: string;
};

/** Low-noise, at most 3 suggestions derived from existing progress data. */
export function buildIncentiveSuggestions(input: {
  enabled: boolean;
  completedThisWeek: number;
  threshold: number;
  remainingToThreshold: number;
  thresholdReached: boolean;
  weeklyPotentialFormatted: string;
  streakEnabled: boolean;
  currentStreakWeeks: number;
  activeDayKickerEnabled: boolean;
  activeDayThreshold: number;
  activeDaysThisWeek: number;
  activeDayKickerFormatted: string | null;
  earnedStatuses: IncentiveAwardStatus[];
}): IncentiveSuggestion[] {
  if (!input.enabled) return [];
  const out: IncentiveSuggestion[] = [];

  if (!input.thresholdReached && input.remainingToThreshold > 0) {
    out.push({
      id: "complete-more",
      tone: "progress",
      title: `Complete ${input.remainingToThreshold} more qualifying ${input.remainingToThreshold === 1 ? "task" : "tasks"} this week`,
      detail: `Reach this week's threshold to earn up to ${input.weeklyPotentialFormatted}.`,
    });
  }

  if (
    input.streakEnabled &&
    input.currentStreakWeeks > 0 &&
    !input.thresholdReached
  ) {
    out.push({
      id: "streak-risk",
      tone: "streak",
      title: "Keep your streak alive",
      detail: `Reach this week's threshold to extend your ${input.currentStreakWeeks}-week streak.`,
    });
  }

  if (
    input.activeDayKickerEnabled &&
    input.activeDaysThisWeek < input.activeDayThreshold &&
    input.activeDayKickerFormatted
  ) {
    const need = input.activeDayThreshold - input.activeDaysThisWeek;
    out.push({
      id: "kicker",
      tone: "info",
      title: `Stay active ${need} more ${need === 1 ? "day" : "days"} this week`,
      detail: `Hit ${input.activeDayThreshold} active days to add a ${input.activeDayKickerFormatted} bonus.`,
    });
  }

  const hasPending = input.earnedStatuses.some(
    (status) =>
      status === "PENDING" ||
      status === "HELD" ||
      status === "RELEASING" ||
      status === "TRANSACTION_PENDING",
  );
  if (hasPending) {
    out.push({
      id: "pending",
      tone: "pending",
      title: "An award is on the way",
      detail:
        "Your earned award is pending release after the admin review window.",
    });
  }

  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Qualification summary (built server-side, consumed by the help drawer)
// ---------------------------------------------------------------------------

export type IncentiveQualificationSummary = {
  currency: CurrencyCode;
  weekKey: string;
  windowLabel: string;
  minEstimateToCount: number;
  excludedLabels: string[];
  stabilityLabel: string;
  disputeWindowLabel: string;
  tiers: { threshold: number; amountFormatted: string }[];
  weeklyPotentialFormatted: string;
  activeDayKickerEnabled: boolean;
  activeDayThreshold: number;
  activeDayKickerAmountFormatted: string | null;
  streakEnabled: boolean;
  streakThresholdWeeks: number;
  streakAmountFormatted: string | null;
  milestoneEnabled: boolean;
  milestones: { count: number; amountFormatted: string }[];
};

// ---------------------------------------------------------------------------
// Admin summary + "what developers see" preview
// ---------------------------------------------------------------------------

export type AdminIncentiveRewardChip = {
  key: "weekly" | "streak" | "milestone" | "leaderboard" | "activeDay";
  label: string;
  enabled: boolean;
};

export type AdminIncentiveSummary = {
  programState: { label: string; color: string };
  activatedLabel: string;
  activeRewards: AdminIncentiveRewardChip[];
  weekly: { threshold: number; myrFormatted: string; robuxFormatted: string };
  activeDayKicker: {
    enabled: boolean;
    threshold: number;
    myrFormatted: string;
    robuxFormatted: string;
  };
  payoutMode: { label: string; detail: string };
  disputeWindowHours: number;
  caps: {
    perUserWeeklyMyrFormatted: string;
    perUserWeeklyRobuxFormatted: string;
    perUserMonthlyMyrFormatted: string;
    perUserMonthlyRobuxFormatted: string;
  };
  /** One-line "what developers see" preview, computed live from form state. */
  developerPreview: string;
};

/**
 * Structural input for {@link buildAdminIncentiveSummary}. Defined locally (a
 * subset of the admin tab's `IncentiveConfigData`) so this module does not
 * import the client component.
 */
export type AdminIncentiveSummaryInput = {
  enabled: boolean;
  activatedAt: string | null;
  weeklyEnabled: boolean;
  weeklyThreshold: number;
  weeklyMyrAmount: number;
  weeklyRobuxAmount: number;
  streakEnabled: boolean;
  milestoneEnabled: boolean;
  leaderboardEnabled: boolean;
  activeDayKickerEnabled: boolean;
  activeDayThreshold: number;
  activeDayKickerMyr: number;
  activeDayKickerRobux: number;
  autoPayout: boolean;
  disputeWindowHours: number;
  perUserWeeklyCapMyr: number;
  perUserWeeklyCapRobux: number;
  perUserMonthlyCapMyr: number;
  perUserMonthlyCapRobux: number;
};

export function buildAdminIncentiveSummary(
  config: AdminIncentiveSummaryInput,
): AdminIncentiveSummary {
  const fmtMyr = (amount: number) => formatAmount(amount, "MYR");
  const fmtRobux = (amount: number) => formatAmount(amount, "ROBUX");

  const kickerSuffix = config.activeDayKickerEnabled
    ? ` (plus up to ${fmtMyr(config.activeDayKickerMyr)} / ${fmtRobux(config.activeDayKickerRobux)} active-day bonus)`
    : "";

  const developerPreview = config.enabled
    ? `Complete ${config.weeklyThreshold} qualifying ${config.weeklyThreshold === 1 ? "task" : "tasks"} each week to earn ${fmtMyr(config.weeklyMyrAmount)} / ${fmtRobux(config.weeklyRobuxAmount)}${kickerSuffix}.`
    : 'Developers see "Incentive program is not live yet." No earnings are shown while disabled.';

  return {
    programState: config.enabled
      ? { label: "Active", color: "green" }
      : { label: "Disabled", color: "gray" },
    activatedLabel: config.activatedAt
      ? `Active since ${new Date(config.activatedAt).toLocaleDateString()}`
      : "Not yet activated",
    activeRewards: [
      {
        key: "weekly",
        label: "Weekly throughput",
        enabled: config.weeklyEnabled,
      },
      { key: "streak", label: "Streak", enabled: config.streakEnabled },
      {
        key: "milestone",
        label: "Milestone",
        enabled: config.milestoneEnabled,
      },
      {
        key: "leaderboard",
        label: "Leaderboard",
        enabled: config.leaderboardEnabled,
      },
      {
        key: "activeDay",
        label: "Active-day kicker",
        enabled: config.activeDayKickerEnabled,
      },
    ],
    weekly: {
      threshold: config.weeklyThreshold,
      myrFormatted: fmtMyr(config.weeklyMyrAmount),
      robuxFormatted: fmtRobux(config.weeklyRobuxAmount),
    },
    activeDayKicker: {
      enabled: config.activeDayKickerEnabled,
      threshold: config.activeDayThreshold,
      myrFormatted: fmtMyr(config.activeDayKickerMyr),
      robuxFormatted: fmtRobux(config.activeDayKickerRobux),
    },
    payoutMode: config.autoPayout
      ? {
          label: "Auto-payout",
          detail: "Released awards create payout transactions automatically.",
        }
      : {
          label: "Manual payout",
          detail: "Released awards wait for manual admin payout.",
        },
    disputeWindowHours: config.disputeWindowHours,
    caps: {
      perUserWeeklyMyrFormatted: fmtMyr(config.perUserWeeklyCapMyr),
      perUserWeeklyRobuxFormatted: fmtRobux(config.perUserWeeklyCapRobux),
      perUserMonthlyMyrFormatted: fmtMyr(config.perUserMonthlyCapMyr),
      perUserMonthlyRobuxFormatted: fmtRobux(config.perUserMonthlyCapRobux),
    },
    developerPreview,
  };
}

// ---------------------------------------------------------------------------
// Admin action consequences
// ---------------------------------------------------------------------------

export type IncentiveActionKind = "cancel" | "clawback" | "approve";

/** Plain-language effect of an admin award action, shown before confirming. */
export function incentiveActionConsequence(
  kind: IncentiveActionKind,
  award: {
    amountFormatted: string;
    clawbackMode?: "NET_NEXT" | "MANUAL_ADJUSTMENT";
  },
): string {
  if (kind === "approve") {
    return `Releases this held award (${award.amountFormatted}) back into the normal payout flow. It pays out after the review window.`;
  }
  if (kind === "cancel") {
    return `Cancels this award (${award.amountFormatted}). It will not be paid, and the developer is notified that it was disputed.`;
  }
  if (award.clawbackMode === "MANUAL_ADJUSTMENT") {
    return `Records a manual adjustment: a negative ${award.amountFormatted} transaction is created immediately to recover the paid award.`;
  }
  return `Queues a clawback of ${award.amountFormatted}. The amount is netted against this developer's next incentive payout(s).`;
}
