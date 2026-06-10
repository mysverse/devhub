import crypto from "node:crypto";
import type {
  IncentiveAward,
  IncentiveAwardStatus,
  IncentiveConfig,
  IncentiveType,
  Prisma,
} from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";
import { cache, createElement } from "react";
import IncentiveAdminDigest from "@/emails/IncentiveAdminDigest";
import IncentiveEarned from "@/emails/IncentiveEarned";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import {
  type CurrencyCode,
  formatAmount,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { sendEmail } from "@/lib/email";
import {
  buildIncentiveEarningPotential,
  buildIncentiveNextTargets,
  buildIncentiveSuggestions,
  type IncentiveEarningPotential,
  type IncentiveNextTarget,
  type IncentiveQualificationSummary,
  type IncentiveStatusCopy,
  type IncentiveSuggestion,
  incentiveStatusCopy,
} from "@/lib/incentive-copy";
import prisma from "@/lib/prisma";

export type LinearIncentiveIssueInput = {
  id: string;
  identifier?: string | null;
  title?: string | null;
  url?: string | null;
  estimate?: number | null;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  trashed?: boolean | null;
  state?: {
    type?: string | null;
    name?: string | null;
  } | null;
  assignee?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    displayName?: string | null;
  } | null;
  labels?: { name?: string | null }[] | null;
};

type IncentiveCurrencyAmounts = {
  myr: number;
  robux: number;
};

type WeeklyTier = {
  threshold: number;
} & IncentiveCurrencyAmounts;

type Milestone = {
  count: number;
} & IncentiveCurrencyAmounts;

type QualifyingIssue = {
  id: string;
  estimate: number | null;
  observedCompletedAt: Date | null;
  weekKey: string | null;
};

const DEFAULT_INCENTIVE_EXCLUDED_LABELS: string[] = [];
const DEFAULT_WEEKLY_TIER: WeeklyTier = {
  threshold: 5,
  myr: 30,
  robux: 1800,
};
const DEFAULT_MILESTONES: Milestone[] = [
  { count: 25, myr: 40, robux: 2400 },
  { count: 50, myr: 75, robux: 4500 },
  { count: 100, myr: 150, robux: 9000 },
];
const PAYABLE_AWARD_STATUSES: IncentiveAwardStatus[] = [
  "PENDING",
  "HELD",
  "RELEASING",
  "TRANSACTION_PENDING",
  "PAID",
  "CLAWBACK_REQUESTED",
  "SETTLED_BY_CLAWBACK",
];
const RELEASE_REVALIDATE_INCLUDE = {
  awardIssues: {
    include: {
      issueCompletion: {
        select: {
          id: true,
          completed: true,
          latestLinearStateType: true,
          archivedAt: true,
          trashed: true,
          assigneeLinearId: true,
          assigneeAtCompletion: true,
        },
      },
    },
  },
} satisfies Prisma.IncentiveAwardInclude;

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function issueLabelNames(input: LinearIncentiveIssueInput) {
  return (input.labels ?? [])
    .map((label) => label.name?.trim())
    .filter((name): name is string => !!name);
}

function coerceDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAmount(amount: number, currency: CurrencyCode) {
  if (currency === "ROBUX") return Math.max(0, Math.round(amount));
  return Math.max(0, Math.round(amount * 100) / 100);
}

function currencyAmount(
  amounts: IncentiveCurrencyAmounts,
  currency: CurrencyCode,
) {
  return currency === "ROBUX" ? amounts.robux : amounts.myr;
}

function getCapForCurrency(
  config: IncentiveConfig,
  currency: CurrencyCode,
  window: "week" | "month",
) {
  if (window === "week") {
    return currency === "ROBUX"
      ? config.perUserWeeklyCapRobux
      : config.perUserWeeklyCapMyr;
  }
  return currency === "ROBUX"
    ? config.perUserMonthlyCapRobux
    : config.perUserMonthlyCapMyr;
}

function getProgramBudgetForCurrency(
  config: IncentiveConfig,
  currency: CurrencyCode,
  window: "week" | "month",
) {
  if (window === "week") {
    return currency === "ROBUX"
      ? config.programWeeklyBudgetRobux
      : config.programWeeklyBudgetMyr;
  }
  return currency === "ROBUX"
    ? config.programMonthlyBudgetRobux
    : config.programMonthlyBudgetMyr;
}

function jsonArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function parseWeeklyTiers(config: IncentiveConfig): WeeklyTier[] {
  const tiers = jsonArray(config.weeklyTiers)
    .map((item) => {
      if (typeof item !== "object" || !item) return null;
      const record = item as Record<string, unknown>;
      const threshold = Number(record.threshold);
      const myr = Number(record.myr);
      const robux = Number(record.robux);
      if (!Number.isFinite(threshold) || threshold <= 0) return null;
      return {
        threshold: Math.floor(threshold),
        myr: Number.isFinite(myr) && myr > 0 ? myr : config.weeklyMyrAmount,
        robux:
          Number.isFinite(robux) && robux > 0
            ? robux
            : config.weeklyRobuxAmount,
      };
    })
    .filter((tier): tier is WeeklyTier => Boolean(tier));

  if (tiers.length === 0) {
    return [
      {
        ...DEFAULT_WEEKLY_TIER,
        threshold: config.weeklyThreshold,
        myr: config.weeklyMyrAmount,
        robux: config.weeklyRobuxAmount,
      },
    ];
  }

  return tiers.sort((a, b) => a.threshold - b.threshold);
}

function parseMilestones(config: IncentiveConfig): Milestone[] {
  const milestones = jsonArray(config.milestones)
    .map((item) => {
      if (typeof item !== "object" || !item) return null;
      const record = item as Record<string, unknown>;
      const count = Number(record.count);
      const myr = Number(record.myr);
      const robux = Number(record.robux);
      if (!Number.isFinite(count) || count <= 0) return null;
      return {
        count: Math.floor(count),
        myr: Number.isFinite(myr) && myr > 0 ? myr : config.weeklyMyrAmount,
        robux:
          Number.isFinite(robux) && robux > 0
            ? robux
            : config.weeklyRobuxAmount,
      };
    })
    .filter((milestone): milestone is Milestone => Boolean(milestone));

  return (milestones.length > 0 ? milestones : DEFAULT_MILESTONES).sort(
    (a, b) => a.count - b.count,
  );
}

function getEffectiveExcludedLabels(
  config: Pick<IncentiveConfig, "excludedLabels">,
) {
  const labels = [
    ...DEFAULT_INCENTIVE_EXCLUDED_LABELS,
    ...config.excludedLabels,
  ];
  return new Set(labels.map(normalizeLabel));
}

function issueHasExcludedLabel(labels: string[], config: IncentiveConfig) {
  const excluded = getEffectiveExcludedLabels(config);
  return labels.some((label) => excluded.has(normalizeLabel(label)));
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function dateOnlyUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getWeekKey(date: Date): string {
  const working = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((working.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getWeekBoundsFor(weekKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error(`Invalid ISO week key: ${weekKey}`);

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

function getJustClosedWeekKey(now = new Date()) {
  const currentWeek = getWeekBoundsFor(getWeekKey(now));
  return getWeekKey(new Date(currentWeek.weekStart.getTime() - 1));
}

function shiftWeekKey(weekKey: string, weeks: number) {
  const { weekStart } = getWeekBoundsFor(weekKey);
  const shifted = new Date(weekStart);
  shifted.setUTCDate(shifted.getUTCDate() + weeks * 7);
  return getWeekKey(shifted);
}

function getMonthBounds(date = new Date()) {
  const monthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1,
  );
  return { monthStart, monthEnd };
}

async function findAssigneeUser(input: LinearIncentiveIssueInput) {
  const assigneeLinearId = input.assignee?.id?.trim() || null;
  const assigneeEmail = input.assignee?.email?.trim() || null;
  const whereOr = [
    ...(assigneeLinearId ? [{ linearId: assigneeLinearId }] : []),
    ...(assigneeEmail ? [{ linearEmail: assigneeEmail }] : []),
  ];

  if (whereOr.length === 0) return null;
  return prisma.userProfile.findFirst({ where: { OR: whereOr } });
}

async function appendIncentiveEvent({
  awardId,
  userId,
  type,
  period,
  message,
  metadata,
}: {
  awardId?: string | null;
  userId?: string | null;
  type: string;
  period?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.incentiveEvent.create({
    data: {
      awardId: awardId ?? null,
      userId: userId ?? null,
      type,
      period: period ?? null,
      message: message ?? null,
      metadata,
    },
  });
}

async function createAwardNotification(
  awardId: string,
  userId: string,
  type: "NEW_INCENTIVE" | "INCENTIVE_DISPUTED" = "NEW_INCENTIVE",
) {
  try {
    await prisma.incentiveNotification.create({
      data: { awardId, userId, type },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
}

async function notifyDeveloperAward(awardId: string) {
  const award = await prisma.incentiveAward.findUnique({
    where: { id: awardId },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!award?.user.user.email) return;

  try {
    await sendEmail({
      to: award.user.user.email,
      subject: "New DevHub incentive earned",
      category: "incentive_earned",
      idempotencyKey: `incentive:earned:${award.id}`,
      react: createElement(IncentiveEarned, {
        userName: award.user.legalName || award.user.user.name || "developer",
        amount: formatAmount(award.amount, award.currency as CurrencyCode),
        awardType: formatAwardType(award.type),
        period: award.period,
        held: award.status === "HELD",
        releaseAt: award.releaseAt?.toISOString() ?? null,
      }),
    });
  } catch (error) {
    console.error("[incentives] Failed to email incentive award:", error);
  }
}

async function notifyAdminsForAward(awardId: string, reason: string) {
  const existingAlert = await prisma.incentiveEvent.findFirst({
    where: { awardId, type: "ADMIN_ALERT_SENT", message: reason },
    select: { id: true },
  });
  if (existingAlert) return;

  const [award, admins] = await Promise.all([
    prisma.incentiveAward.findUnique({
      where: { id: awardId },
      include: { user: { include: { user: { select: { name: true } } } } },
    }),
    prisma.userProfile.findMany({
      where: ADMIN_ACCESS_WHERE,
      include: { user: { select: { email: true } } },
    }),
  ]);
  if (!award) return;

  for (const admin of admins) {
    if (!admin.user.email) continue;
    try {
      await sendEmail({
        to: admin.user.email,
        subject: "Incentive award needs review",
        category: "incentive_admin_alert",
        idempotencyKey: `incentive:admin-alert:${award.id}:${reason}`,
        react: createElement(IncentiveAdminDigest, {
          eventCount: 1,
          pendingCount: award.status === "PENDING" ? 1 : 0,
          heldCount: award.status === "HELD" ? 1 : 0,
          releasedCount: 0,
          paidCount: 0,
          headline: "Incentive award needs review",
          detail: `${award.user.legalName || award.user.user.name || "Developer"}: ${formatAwardType(award.type)} held for ${reason}.`,
        }),
      });
    } catch (error) {
      console.error(
        "[incentives] Failed to email incentive admin alert:",
        error,
      );
    }
  }

  await appendIncentiveEvent({
    awardId,
    userId: award.userId,
    type: "ADMIN_ALERT_SENT",
    period: award.period,
    message: reason,
  });
}

export function formatAwardType(type: IncentiveType | string) {
  if (type === "WEEKLY_THROUGHPUT") return "Weekly throughput";
  if (type === "STREAK") return "Streak";
  if (type === "MILESTONE") return "Milestone";
  if (type === "LEADERBOARD") return "Leaderboard";
  return type;
}

async function getIncentiveConfigCached(): Promise<IncentiveConfig> {
  "use cache";

  cacheTag(TAGS.incentiveConfig);
  cacheLife({ revalidate: 3600, expire: 86_400 });

  const existing = await prisma.incentiveConfig.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;

  return prisma.incentiveConfig.create({
    data: { id: "default" },
  });
}

export const getIncentiveConfig = cache(getIncentiveConfigCached);

export async function recordIssueCompletionFromLinear(
  input: LinearIncentiveIssueInput,
) {
  try {
    if (!input.id) return null;

    const existing = await prisma.issueCompletion.findUnique({
      where: { linearIssueId: input.id },
    });
    const latestLinearUpdatedAt = coerceDate(input.updatedAt);
    if (
      latestLinearUpdatedAt &&
      existing?.latestLinearUpdatedAt &&
      latestLinearUpdatedAt < existing.latestLinearUpdatedAt
    ) {
      await appendIncentiveEvent({
        userId: existing.userId,
        type: "STALE_LINEAR_WEBHOOK",
        message: `Ignored stale webhook for ${input.identifier || input.id}`,
        metadata: {
          linearIssueId: input.id,
          incomingUpdatedAt: latestLinearUpdatedAt.toISOString(),
          latestLinearUpdatedAt: existing.latestLinearUpdatedAt.toISOString(),
        },
      });
      return existing;
    }

    const labels = issueLabelNames(input);
    const normalizedLabels = new Set(labels.map(normalizeLabel));
    const stateType = input.state?.type ?? null;
    const stateName = input.state?.name ?? null;
    const isCompleted = stateType === "completed";
    const wasCompleted = existing?.completed ?? false;
    const transitionedIntoCompleted = isCompleted && !wasCompleted;
    const linearCompletedAt = coerceDate(input.completedAt);
    const archivedAt = coerceDate(input.archivedAt);
    const trashed = Boolean(input.trashed);
    const assigneeLinearId = input.assignee?.id?.trim() || null;
    const assigneeEmail = input.assignee?.email?.trim() || null;
    const assigneeName =
      input.assignee?.displayName?.trim() ||
      input.assignee?.name?.trim() ||
      assigneeEmail ||
      null;
    const user = await findAssigneeUser(input);
    const now = new Date();
    const observedCompletedAt = transitionedIntoCompleted
      ? now
      : isCompleted
        ? (existing?.observedCompletedAt ?? now)
        : null;

    const data = {
      linearIssueIdentifier: input.identifier ?? null,
      linearIssueTitle: input.title ?? null,
      linearIssueUrl: input.url ?? null,
      userId: user?.id ?? null,
      assigneeLinearId,
      assigneeEmail,
      assigneeName,
      assigneeAtCompletion: transitionedIntoCompleted
        ? assigneeLinearId
        : isCompleted
          ? (existing?.assigneeAtCompletion ?? assigneeLinearId)
          : (existing?.assigneeAtCompletion ?? null),
      estimate:
        Number.isInteger(input.estimate) && input.estimate
          ? Math.floor(input.estimate)
          : null,
      labels,
      hasPptLabel: normalizedLabels.has("ppt"),
      completed: isCompleted,
      observedCompletedAt,
      linearCompletedAt,
      completionEpisode: transitionedIntoCompleted
        ? (existing?.completionEpisode ?? 0) + 1
        : (existing?.completionEpisode ?? 0),
      weekKey: observedCompletedAt ? getWeekKey(observedCompletedAt) : null,
      latestLinearStateType: stateType,
      latestLinearStateName: stateName,
      latestLinearUpdatedAt,
      archivedAt,
      trashed,
    };

    const completion = existing
      ? await prisma.issueCompletion.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.issueCompletion.create({
          data: { linearIssueId: input.id, ...data },
        });

    if (transitionedIntoCompleted && completion.userId) {
      await evaluateMilestones(completion.userId);
    }

    return completion;
  } catch (error) {
    console.error("[incentives] Failed to record Linear completion:", error);
    return null;
  }
}

async function getQualifyingIssuesForWeek(
  userId: string,
  weekKey: string,
  config: IncentiveConfig,
  activatedAt: Date,
  now = new Date(),
): Promise<QualifyingIssue[]> {
  const stabilityCutoff = new Date(
    now.getTime() - Math.max(0, config.stabilityMinutes) * 60_000,
  );

  const issues = await prisma.issueCompletion.findMany({
    where: {
      userId,
      weekKey,
      completed: true,
      observedCompletedAt: {
        gte: activatedAt,
        lte: stabilityCutoff,
      },
      archivedAt: null,
      trashed: false,
      OR: [
        { latestLinearStateType: null },
        { latestLinearStateType: { notIn: ["canceled", "cancelled"] } },
      ],
    },
    select: {
      id: true,
      estimate: true,
      labels: true,
      countedInWeek: true,
      observedCompletedAt: true,
      weekKey: true,
      assigneeLinearId: true,
      assigneeAtCompletion: true,
    },
  });

  return issues.filter((issue) => {
    if (issue.countedInWeek && issue.countedInWeek !== weekKey) return false;
    if (!issue.estimate || issue.estimate < config.minEstimateToCount) {
      return false;
    }
    if (issueHasExcludedLabel(issue.labels, config)) return false;
    if (
      issue.assigneeAtCompletion &&
      issue.assigneeLinearId !== issue.assigneeAtCompletion
    ) {
      return false;
    }
    return true;
  });
}

async function countNoEstimateRatioFlag(
  userId: string,
  weekKey: string,
  activatedAt: Date,
  threshold: number,
) {
  if (threshold <= 0 || threshold >= 1) return false;
  const completions = await prisma.issueCompletion.findMany({
    where: {
      userId,
      weekKey,
      completed: true,
      observedCompletedAt: { gte: activatedAt },
    },
    select: { estimate: true },
  });
  if (completions.length === 0) return false;
  const noEstimate = completions.filter((issue) => !issue.estimate).length;
  return noEstimate / completions.length > threshold;
}

async function getDistinctActiveDaysForWeek(userId: string, weekKey: string) {
  const { weekStart, weekEnd } = getWeekBoundsFor(weekKey);
  const start = dateOnlyUtc(weekStart);
  const end = dateOnlyUtc(weekEnd);
  return prisma.userActivityDay.count({
    where: { userId, activityDate: { gte: start, lte: end } },
  });
}

async function getLifetimeQualifyingCount(
  userId: string,
  config: IncentiveConfig,
  activatedAt: Date,
) {
  const issues = await prisma.issueCompletion.findMany({
    where: {
      userId,
      completed: true,
      observedCompletedAt: { gte: activatedAt },
      archivedAt: null,
      trashed: false,
      OR: [
        { latestLinearStateType: null },
        { latestLinearStateType: { notIn: ["canceled", "cancelled"] } },
      ],
    },
    select: {
      estimate: true,
      labels: true,
      assigneeLinearId: true,
      assigneeAtCompletion: true,
    },
  });

  return issues.filter((issue) => {
    if (!issue.estimate || issue.estimate < config.minEstimateToCount) {
      return false;
    }
    if (issueHasExcludedLabel(issue.labels, config)) return false;
    return !(
      issue.assigneeAtCompletion &&
      issue.assigneeLinearId !== issue.assigneeAtCompletion
    );
  }).length;
}

async function getCurrentStreakWeeks(
  userId: string,
  endingWeekKey: string,
  config: IncentiveConfig,
  activatedAt: Date,
) {
  let streak = 0;
  let weekKey = endingWeekKey;

  for (let i = 0; i < 104; i++) {
    const issues = await getQualifyingIssuesForWeek(
      userId,
      weekKey,
      config,
      activatedAt,
    );
    if (issues.length < config.weeklyThreshold) break;
    streak++;
    weekKey = shiftWeekKey(weekKey, -1);
  }

  return streak;
}

async function weeklyCountsForUser(
  userId: string,
  currentWeekKey: string,
  config: IncentiveConfig,
  activatedAt: Date,
) {
  const counts: number[] = [];
  let weekKey = shiftWeekKey(currentWeekKey, -1);
  for (let i = 0; i < 12; i++) {
    const issues = await getQualifyingIssuesForWeek(
      userId,
      weekKey,
      config,
      activatedAt,
    );
    if (issues.length > 0) counts.push(issues.length);
    weekKey = shiftWeekKey(weekKey, -1);
  }
  return counts;
}

function median(numbers: number[]) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

async function anomalyTriggered(
  userId: string,
  weekKey: string,
  currentCount: number,
  config: IncentiveConfig,
  activatedAt: Date,
) {
  const baseline = await weeklyCountsForUser(
    userId,
    weekKey,
    config,
    activatedAt,
  );
  if (baseline.length < config.anomalyMinBaselineWeeks) return false;
  const baselineMedian = median(baseline);
  return (
    baselineMedian > 0 &&
    currentCount > baselineMedian * config.anomalyMultiplier
  );
}

async function aggregateAwardUsage({
  userId,
  currency,
  start,
  end,
  excludeAwardIds = [],
}: {
  userId?: string;
  currency: CurrencyCode;
  start: Date;
  end: Date;
  excludeAwardIds?: string[];
}) {
  const result = await prisma.incentiveAward.aggregate({
    where: {
      ...(userId ? { userId } : {}),
      currency,
      status: { in: PAYABLE_AWARD_STATUSES },
      createdAt: { gte: start, lte: end },
      ...(excludeAwardIds.length > 0 ? { id: { notIn: excludeAwardIds } } : {}),
    },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function openDebtAmount(userId: string, currency: CurrencyCode) {
  const result = await prisma.incentiveClawbackDebt.aggregate({
    where: { userId, currency, status: "OPEN" },
    _sum: { remainingAmount: true },
  });
  return result._sum.remainingAmount ?? 0;
}

export async function getUserIncentiveUsage(
  userId: string,
  currency: CurrencyCode,
  window: "week" | "month",
) {
  const config = await getIncentiveConfig();
  const now = new Date();
  const { start, end } =
    window === "week"
      ? (() => {
          const bounds = getWeekBoundsFor(getWeekKey(now));
          return { start: bounds.weekStart, end: bounds.weekEnd };
        })()
      : (() => {
          const bounds = getMonthBounds(now);
          return { start: bounds.monthStart, end: bounds.monthEnd };
        })();
  const used =
    (await aggregateAwardUsage({ userId, currency, start, end })) +
    (await openDebtAmount(userId, currency));
  const limit = getCapForCurrency(config, currency, window);
  return { used, limit, remaining: limit > 0 ? Math.max(0, limit - used) : 0 };
}

async function guardrailHoldReason({
  userId,
  currency,
  amount,
  weekKey,
  issueCount,
  config,
  activatedAt,
}: {
  userId: string;
  currency: CurrencyCode;
  amount: number;
  weekKey: string;
  issueCount: number;
  config: IncentiveConfig;
  activatedAt: Date;
}) {
  const { weekStart, weekEnd } = getWeekBoundsFor(weekKey);
  const { monthStart, monthEnd } = getMonthBounds(weekStart);
  const weeklyCap = getCapForCurrency(config, currency, "week");
  const monthlyCap = getCapForCurrency(config, currency, "month");
  const programWeeklyBudget = getProgramBudgetForCurrency(
    config,
    currency,
    "week",
  );
  const programMonthlyBudget = getProgramBudgetForCurrency(
    config,
    currency,
    "month",
  );

  const [
    userWeeklyUsed,
    userMonthlyUsed,
    programWeeklyUsed,
    programMonthlyUsed,
    debt,
    noEstimateFlag,
    anomalyFlag,
  ] = await Promise.all([
    aggregateAwardUsage({ userId, currency, start: weekStart, end: weekEnd }),
    aggregateAwardUsage({ userId, currency, start: monthStart, end: monthEnd }),
    aggregateAwardUsage({ currency, start: weekStart, end: weekEnd }),
    aggregateAwardUsage({ currency, start: monthStart, end: monthEnd }),
    openDebtAmount(userId, currency),
    countNoEstimateRatioFlag(
      userId,
      weekKey,
      activatedAt,
      config.noEstimateRatioFlag,
    ),
    anomalyTriggered(userId, weekKey, issueCount, config, activatedAt),
  ]);

  if (weeklyCap > 0 && userWeeklyUsed + debt + amount > weeklyCap) {
    return "over_weekly_cap";
  }
  if (monthlyCap > 0 && userMonthlyUsed + debt + amount > monthlyCap) {
    return "over_monthly_cap";
  }
  if (
    programWeeklyBudget > 0 &&
    programWeeklyUsed + amount > programWeeklyBudget
  ) {
    return "over_weekly_budget";
  }
  if (
    programMonthlyBudget > 0 &&
    programMonthlyUsed + amount > programMonthlyBudget
  ) {
    return "over_monthly_budget";
  }
  if (anomalyFlag) return "anomaly";
  if (noEstimateFlag) return "no_estimate_ratio";

  return null;
}

async function createIncentiveAward({
  userId,
  type,
  period,
  thresholdMet,
  detail,
  currency,
  amount,
  issueIds = [],
  config,
  activatedAt,
}: {
  userId: string;
  type: IncentiveType;
  period: string;
  thresholdMet: number;
  detail?: Prisma.InputJsonValue;
  currency: CurrencyCode;
  amount: number;
  issueIds?: string[];
  config: IncentiveConfig;
  activatedAt: Date;
}) {
  const normalizedAmount = normalizeAmount(amount, currency);
  if (normalizedAmount <= 0) return null;

  const issueCount = issueIds.length || thresholdMet;
  const heldReason =
    period.includes("-W") && issueCount > 0
      ? await guardrailHoldReason({
          userId,
          currency,
          amount: normalizedAmount,
          weekKey: period,
          issueCount,
          config,
          activatedAt,
        })
      : null;
  const status: IncentiveAwardStatus = heldReason ? "HELD" : "PENDING";
  const releaseAt =
    status === "PENDING"
      ? new Date(
          Date.now() + Math.max(0, config.disputeWindowHours) * 60 * 60_000,
        )
      : null;

  try {
    const award = await prisma.incentiveAward.create({
      data: {
        userId,
        type,
        period,
        thresholdMet,
        detail,
        amount: normalizedAmount,
        netAmount: normalizedAmount,
        currency,
        status,
        heldReason,
        releaseAt,
        awardIssues:
          issueIds.length > 0
            ? {
                createMany: {
                  data: issueIds.map((issueCompletionId) => ({
                    issueCompletionId,
                  })),
                  skipDuplicates: true,
                },
              }
            : undefined,
      },
    });

    await createAwardNotification(award.id, userId);
    await appendIncentiveEvent({
      awardId: award.id,
      userId,
      type: status === "HELD" ? "HELD" : "AWARD_CREATED",
      period,
      message: heldReason,
      metadata: { type, amount: normalizedAmount, currency },
    });
    await notifyDeveloperAward(award.id);
    if (heldReason) {
      await notifyAdminsForAward(award.id, heldReason);
    }

    return award;
  } catch (error) {
    if (isUniqueConstraintError(error)) return null;
    throw error;
  }
}

export async function evaluateMilestones(userId: string) {
  const config = await getIncentiveConfig();
  if (!config.enabled || !config.activatedAt || !config.milestoneEnabled) {
    return { created: 0 };
  }

  const user = await prisma.userProfile.findUnique({ where: { id: userId } });
  if (!user) return { created: 0 };
  const currency = getCurrencyForPaymentMethod(user.paymentMethod);
  const lifetimeCount = await getLifetimeQualifyingCount(
    userId,
    config,
    config.activatedAt,
  );

  let created = 0;
  for (const milestone of parseMilestones(config)) {
    if (lifetimeCount < milestone.count) continue;
    const award = await createIncentiveAward({
      userId,
      type: "MILESTONE",
      period: `lifetime:${milestone.count}`,
      thresholdMet: lifetimeCount,
      detail: { milestone: milestone.count },
      currency,
      amount: currencyAmount(milestone, currency),
      config,
      activatedAt: config.activatedAt,
    });
    if (award) created++;
  }

  return { created };
}

export async function evaluateWeeklyIncentives(
  weekKey = getJustClosedWeekKey(),
) {
  const config = await getIncentiveConfig();
  if (!config.enabled || !config.activatedAt) {
    return { created: 0, held: 0, weekKey, skipped: true };
  }

  const { weekEnd } = getWeekBoundsFor(weekKey);
  if (weekEnd < config.activatedAt) {
    return { created: 0, held: 0, weekKey, skipped: true };
  }

  const users = await prisma.issueCompletion.findMany({
    where: {
      weekKey,
      userId: { not: null },
      observedCompletedAt: { gte: config.activatedAt },
    },
    distinct: ["userId"],
    select: { userId: true },
  });

  const leaderboard: {
    userId: string;
    currency: CurrencyCode;
    count: number;
    issueIds: string[];
  }[] = [];
  let created = 0;
  let held = 0;

  for (const row of users) {
    if (!row.userId) continue;
    const [user, issues] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: row.userId } }),
      getQualifyingIssuesForWeek(
        row.userId,
        weekKey,
        config,
        config.activatedAt,
      ),
    ]);
    if (!user || issues.length < config.weeklyThreshold) continue;

    const currency = getCurrencyForPaymentMethod(user.paymentMethod);
    const issueIds = issues.map((issue) => issue.id);
    leaderboard.push({
      userId: row.userId,
      currency,
      count: issues.length,
      issueIds,
    });

    if (config.weeklyEnabled) {
      const tier = parseWeeklyTiers(config)
        .filter((item) => issues.length >= item.threshold)
        .at(-1);
      if (tier) {
        const activeDays = await getDistinctActiveDaysForWeek(
          row.userId,
          weekKey,
        );
        const kicker =
          config.activeDayKickerEnabled &&
          activeDays >= config.activeDayThreshold
            ? currency === "ROBUX"
              ? config.activeDayKickerRobux
              : config.activeDayKickerMyr
            : 0;
        const award = await createIncentiveAward({
          userId: row.userId,
          type: "WEEKLY_THROUGHPUT",
          period: weekKey,
          thresholdMet: issues.length,
          detail: {
            tierThreshold: tier.threshold,
            activeDays,
            activeDayKicker: kicker,
          },
          currency,
          amount: currencyAmount(tier, currency) + kicker,
          issueIds,
          config,
          activatedAt: config.activatedAt,
        });
        if (award) {
          created++;
          if (award.status === "HELD") held++;
          await prisma.issueCompletion.updateMany({
            where: { id: { in: issueIds }, countedInWeek: null },
            data: { countedInWeek: weekKey },
          });
        }
      }
    }

    if (config.streakEnabled && config.streakThresholdWeeks > 0) {
      const streakWeeks = await getCurrentStreakWeeks(
        row.userId,
        weekKey,
        config,
        config.activatedAt,
      );
      if (streakWeeks > 0 && streakWeeks % config.streakThresholdWeeks === 0) {
        const award = await createIncentiveAward({
          userId: row.userId,
          type: "STREAK",
          period: weekKey,
          thresholdMet: streakWeeks,
          detail: { streakWeeks },
          currency,
          amount:
            currency === "ROBUX"
              ? config.streakRobuxAmount
              : config.streakMyrAmount,
          issueIds,
          config,
          activatedAt: config.activatedAt,
        });
        if (award) {
          created++;
          if (award.status === "HELD") held++;
        }
      }
    }
  }

  if (config.leaderboardEnabled && config.leaderboardTopN > 0) {
    const ranked = leaderboard
      .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
      .slice(0, config.leaderboardTopN);

    for (const [index, entry] of ranked.entries()) {
      const award = await createIncentiveAward({
        userId: entry.userId,
        type: "LEADERBOARD",
        period: weekKey,
        thresholdMet: entry.count,
        detail: { rank: index + 1 },
        currency: entry.currency,
        amount:
          entry.currency === "ROBUX"
            ? config.leaderboardRobuxAmount
            : config.leaderboardMyrAmount,
        issueIds: entry.issueIds,
        config,
        activatedAt: config.activatedAt,
      });
      if (award) {
        created++;
        if (award.status === "HELD") held++;
      }
    }
  }

  await appendIncentiveEvent({
    type: "EVALUATED",
    period: weekKey,
    message: `Created ${created} incentive awards`,
    metadata: { created, held },
  });

  return { created, held, weekKey, skipped: false };
}

function awardIssuesInvalid(
  award: IncentiveAward & {
    awardIssues: {
      issueCompletion: {
        completed: boolean;
        latestLinearStateType: string | null;
        archivedAt: Date | null;
        trashed: boolean;
        assigneeLinearId: string | null;
        assigneeAtCompletion: string | null;
      };
    }[];
  },
) {
  return award.awardIssues.some(({ issueCompletion }) => {
    if (!issueCompletion.completed) return true;
    if (
      ["canceled", "cancelled"].includes(
        issueCompletion.latestLinearStateType ?? "",
      )
    ) {
      return true;
    }
    if (issueCompletion.archivedAt || issueCompletion.trashed) return true;
    return Boolean(
      issueCompletion.assigneeAtCompletion &&
        issueCompletion.assigneeLinearId !==
          issueCompletion.assigneeAtCompletion,
    );
  });
}

async function applyClawbackDebt({
  userId,
  currency,
  awards,
}: {
  userId: string;
  currency: CurrencyCode;
  awards: IncentiveAward[];
}) {
  if (awards.length === 0) return { netAmount: 0 };

  let remainingGroupAmount = awards.reduce(
    (sum, award) => sum + award.amount,
    0,
  );
  const debts = await prisma.incentiveClawbackDebt.findMany({
    where: { userId, currency, status: "OPEN", remainingAmount: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });

  for (const debt of debts) {
    if (remainingGroupAmount <= 0) break;
    const applied = Math.min(remainingGroupAmount, debt.remainingAmount);
    const remainingDebt = normalizeAmount(
      debt.remainingAmount - applied,
      currency,
    );
    await prisma.incentiveClawbackDebt.update({
      where: { id: debt.id },
      data: {
        remainingAmount: remainingDebt,
        status: remainingDebt <= 0 ? "SETTLED" : "OPEN",
        settledAt: remainingDebt <= 0 ? new Date() : null,
      },
    });
    remainingGroupAmount = normalizeAmount(
      remainingGroupAmount - applied,
      currency,
    );
  }

  let debtApplied = normalizeAmount(
    awards.reduce((sum, award) => sum + award.amount, 0) - remainingGroupAmount,
    currency,
  );
  for (const award of awards) {
    const appliedToAward = Math.min(award.amount, debtApplied);
    debtApplied = normalizeAmount(debtApplied - appliedToAward, currency);
    await prisma.incentiveAward.update({
      where: { id: award.id },
      data: {
        clawbackApplied: appliedToAward,
        netAmount: normalizeAmount(award.amount - appliedToAward, currency),
      },
    });
  }

  return { netAmount: remainingGroupAmount };
}

async function holdClaimedAwards(
  awards: IncentiveAward[],
  reason: string,
  claimId: string,
) {
  if (awards.length === 0) return;
  const ids = awards.map((award) => award.id);
  await prisma.incentiveAward.updateMany({
    where: { id: { in: ids }, status: "RELEASING", releaseClaimId: claimId },
    data: {
      status: "HELD",
      heldReason: reason,
      claimedAt: null,
      releaseClaimId: null,
    },
  });
  await prisma.incentiveEvent.createMany({
    data: awards.map((award) => ({
      awardId: award.id,
      userId: award.userId,
      type: "HELD",
      period: award.period,
      message: reason,
    })),
  });
}

async function releaseAwardGroup(
  group: IncentiveAward[],
  config: IncentiveConfig,
) {
  const claimId = crypto.randomUUID();
  const now = new Date();
  const ids = group.map((award) => award.id);
  const claim = await prisma.incentiveAward.updateMany({
    where: {
      id: { in: ids },
      status: "PENDING",
      transactionId: null,
      releaseAt: { lte: now },
    },
    data: { status: "RELEASING", claimedAt: now, releaseClaimId: claimId },
  });

  if (claim.count !== ids.length) {
    await prisma.incentiveAward.updateMany({
      where: { id: { in: ids }, status: "RELEASING", releaseClaimId: claimId },
      data: { status: "PENDING", claimedAt: null, releaseClaimId: null },
    });
    return { released: 0, skipped: true };
  }

  const claimed = await prisma.incentiveAward.findMany({
    where: { id: { in: ids }, status: "RELEASING", releaseClaimId: claimId },
    include: RELEASE_REVALIDATE_INCLUDE,
  });
  const invalid = claimed.filter(awardIssuesInvalid);
  if (invalid.length > 0) {
    await holdClaimedAwards(invalid, "issue_invalidated", claimId);
  }
  const valid = claimed.filter(
    (award) => !invalid.some((item) => item.id === award.id),
  );
  if (valid.length === 0) return { released: 0, skipped: false };

  const currency = valid[0].currency as CurrencyCode;
  const userId = valid[0].userId;
  const grossAmount = normalizeAmount(
    valid.reduce((sum, award) => sum + award.amount, 0),
    currency,
  );
  const { weekStart, weekEnd } = getWeekBoundsFor(getWeekKey(now));
  const { monthStart, monthEnd } = getMonthBounds(now);
  const excludeAwardIds = valid.map((award) => award.id);
  const [weeklyUsed, monthlyUsed, weeklyProgramUsed, monthlyProgramUsed] =
    await Promise.all([
      aggregateAwardUsage({
        userId,
        currency,
        start: weekStart,
        end: weekEnd,
        excludeAwardIds,
      }),
      aggregateAwardUsage({
        userId,
        currency,
        start: monthStart,
        end: monthEnd,
        excludeAwardIds,
      }),
      aggregateAwardUsage({
        currency,
        start: weekStart,
        end: weekEnd,
        excludeAwardIds,
      }),
      aggregateAwardUsage({
        currency,
        start: monthStart,
        end: monthEnd,
        excludeAwardIds,
      }),
    ]);

  const weeklyCap = getCapForCurrency(config, currency, "week");
  const monthlyCap = getCapForCurrency(config, currency, "month");
  const weeklyBudget = getProgramBudgetForCurrency(config, currency, "week");
  const monthlyBudget = getProgramBudgetForCurrency(config, currency, "month");
  if (weeklyCap > 0 && weeklyUsed + grossAmount > weeklyCap) {
    await holdClaimedAwards(valid, "over_weekly_cap", claimId);
    return { released: 0, skipped: false };
  }
  if (monthlyCap > 0 && monthlyUsed + grossAmount > monthlyCap) {
    await holdClaimedAwards(valid, "over_monthly_cap", claimId);
    return { released: 0, skipped: false };
  }
  if (weeklyBudget > 0 && weeklyProgramUsed + grossAmount > weeklyBudget) {
    await holdClaimedAwards(valid, "over_weekly_budget", claimId);
    return { released: 0, skipped: false };
  }
  if (monthlyBudget > 0 && monthlyProgramUsed + grossAmount > monthlyBudget) {
    await holdClaimedAwards(valid, "over_monthly_budget", claimId);
    return { released: 0, skipped: false };
  }

  const { netAmount } = await applyClawbackDebt({
    userId,
    currency,
    awards: valid,
  });
  const validIds = valid.map((award) => award.id);
  if (netAmount <= 0) {
    await prisma.incentiveAward.updateMany({
      where: {
        id: { in: validIds },
        status: "RELEASING",
        releaseClaimId: claimId,
      },
      data: {
        status: "SETTLED_BY_CLAWBACK",
        claimedAt: null,
        releaseClaimId: null,
      },
    });
    await prisma.incentiveEvent.createMany({
      data: valid.map((award) => ({
        awardId: award.id,
        userId,
        type: "SETTLED_BY_CLAWBACK",
        period: award.period,
        message: "Award fully netted against open clawback debt",
      })),
    });
    return { released: valid.length, skipped: false };
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      amount: netAmount,
      currency,
      source: "INCENTIVE",
      status: "PENDING",
      autoApproved: config.autoPayout,
      linearIssueIdentifier: `INCENTIVE-${dateOnlyUtc(now)}`,
      linearIssueTitle: `Incentive Awards - ${valid.length} item${valid.length === 1 ? "" : "s"}`,
    },
  });

  await prisma.incentiveAward.updateMany({
    where: {
      id: { in: validIds },
      status: "RELEASING",
      releaseClaimId: claimId,
    },
    data: {
      status: "TRANSACTION_PENDING",
      transactionId: transaction.id,
      claimedAt: null,
      releaseClaimId: null,
    },
  });
  await prisma.incentiveEvent.createMany({
    data: valid.map((award) => ({
      awardId: award.id,
      userId,
      type: "TX_CREATED",
      period: award.period,
      message: transaction.id,
    })),
  });

  if (config.autoPayout) {
    try {
      const { initiateAutoPayout } = await import("@/lib/payout");
      const payout = await initiateAutoPayout(transaction.id);
      await prisma.incentiveEvent.createMany({
        data: valid.map((award) => ({
          awardId: award.id,
          userId,
          type: "AUTO_PAYOUT_STARTED",
          period: award.period,
          message: payout?.id ?? null,
        })),
      });
    } catch (error) {
      console.error("[incentives] Auto-payout failed:", error);
    }
  }

  return { released: valid.length, skipped: false };
}

export async function releaseDueIncentives() {
  const config = await getIncentiveConfig();
  const due = await prisma.incentiveAward.findMany({
    where: {
      status: "PENDING",
      transactionId: null,
      releaseAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const groups = new Map<string, IncentiveAward[]>();
  for (const award of due) {
    const key = `${award.userId}:${award.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), award]);
  }

  let released = 0;
  let skipped = 0;
  for (const group of groups.values()) {
    const result = await releaseAwardGroup(group, config);
    released += result.released;
    if (result.skipped) skipped++;
  }
  return { released, skipped };
}

export async function recordUserActivityDay(userId: string) {
  try {
    await prisma.userActivityDay.upsert({
      where: {
        userId_activityDate: {
          userId,
          activityDate: dateOnlyUtc(),
        },
      },
      create: { userId, activityDate: dateOnlyUtc() },
      update: {},
    });
  } catch (error) {
    console.error("[incentives] Failed to record activity day:", error);
  }
}

export async function markIncentiveAwardsPaidForTransaction(
  transactionId: string,
) {
  const awards = await prisma.incentiveAward.findMany({
    where: { transactionId, status: "TRANSACTION_PENDING" },
    select: { id: true, userId: true, period: true },
  });
  if (awards.length === 0) return;
  await prisma.incentiveAward.updateMany({
    where: { id: { in: awards.map((award) => award.id) } },
    data: { status: "PAID" },
  });
  await prisma.incentiveEvent.createMany({
    data: awards.map((award) => ({
      awardId: award.id,
      userId: award.userId,
      type: "PAID",
      period: award.period,
      message: transactionId,
    })),
  });
}

export async function cancelIncentiveAwardsForTransaction(
  transactionId: string,
  reason?: string | null,
) {
  const awards = await prisma.incentiveAward.findMany({
    where: { transactionId, status: "TRANSACTION_PENDING" },
    select: { id: true, userId: true, period: true },
  });
  if (awards.length === 0) return;
  await prisma.incentiveAward.updateMany({
    where: { id: { in: awards.map((award) => award.id) } },
    data: { status: "CANCELLED", disputeReason: reason ?? null },
  });
  await prisma.incentiveEvent.createMany({
    data: awards.map((award) => ({
      awardId: award.id,
      userId: award.userId,
      type: "CANCELLED",
      period: award.period,
      message: reason ?? "Linked transaction rejected",
    })),
  });
}

export async function requestIncentiveClawback(
  awardId: string,
  adminUserId: string,
  reason?: string,
) {
  const award = await prisma.incentiveAward.findUnique({
    where: { id: awardId },
  });
  if (!award) return { error: "Incentive award not found" };
  if (award.status !== "PAID") {
    return { error: "Only paid incentive awards can be clawed back" };
  }
  const config = await getIncentiveConfig();
  const clawbackAmount = award.netAmount ?? award.amount;

  if (config.clawbackMode === "MANUAL_ADJUSTMENT") {
    await prisma.$transaction(async (tx) => {
      await tx.incentiveAward.update({
        where: { id: awardId },
        data: {
          status: "CLAWBACK_REQUESTED",
          disputedById: adminUserId,
          disputedAt: new Date(),
          disputeReason: reason?.trim() || null,
        },
      });
      await tx.transaction.create({
        data: {
          userId: award.userId,
          amount: -clawbackAmount,
          currency: award.currency,
          source: "MANUAL",
          status: "PAID",
          paidAt: new Date(),
          autoApproved: false,
          linearIssueIdentifier: `CLAWBACK-${award.id.slice(-8)}`,
          linearIssueTitle: `Manual clawback - ${formatAwardType(award.type)} ${award.period}`,
        },
      });
      await tx.incentiveClawbackDebt.create({
        data: {
          userId: award.userId,
          currency: award.currency,
          originalAwardId: award.id,
          amount: clawbackAmount,
          remainingAmount: 0,
          status: "MANUAL_ADJUSTMENT",
          reason: reason?.trim() || null,
          settledAt: new Date(),
        },
      });
      await tx.incentiveEvent.create({
        data: {
          awardId,
          userId: award.userId,
          type: "CLAWBACK_REQUESTED",
          period: award.period,
          message: reason?.trim() || "Manual adjustment transaction recorded",
        },
      });
    });
    return { success: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.incentiveAward.update({
      where: { id: awardId },
      data: {
        status: "CLAWBACK_REQUESTED",
        disputedById: adminUserId,
        disputedAt: new Date(),
        disputeReason: reason?.trim() || null,
      },
    });
    await tx.incentiveClawbackDebt.create({
      data: {
        userId: award.userId,
        currency: award.currency,
        originalAwardId: award.id,
        amount: clawbackAmount,
        remainingAmount: clawbackAmount,
        reason: reason?.trim() || null,
      },
    });
    await tx.incentiveEvent.create({
      data: {
        awardId,
        userId: award.userId,
        type: "CLAWBACK_REQUESTED",
        period: award.period,
        message: reason?.trim() || null,
      },
    });
  });

  return { success: true };
}

export async function sendIncentiveActivationAlert(activatedAt: Date) {
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true } } },
  });
  for (const admin of admins) {
    if (!admin.user.email) continue;
    await sendEmail({
      to: admin.user.email,
      subject: "DevHub incentives enabled",
      category: "incentive_activation",
      idempotencyKey: `incentive:activation:${activatedAt.toISOString()}`,
      react: createElement(IncentiveAdminDigest, {
        eventCount: 0,
        pendingCount: 0,
        heldCount: 0,
        releasedCount: 0,
        paidCount: 0,
        headline: "Incentives enabled",
        detail: `Awards will only count completions observed on or after ${activatedAt.toISOString()}.`,
      }),
    });
  }
  await appendIncentiveEvent({
    type: "ACTIVATED",
    message: activatedAt.toISOString(),
  });
}

export async function sendIncentiveAdminDigest() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await prisma.incentiveEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { type: true },
  });
  if (events.length === 0) return 0;

  const pendingCount = events.filter(
    (event) => event.type === "AWARD_CREATED",
  ).length;
  const heldCount = events.filter((event) => event.type === "HELD").length;
  const releasedCount = events.filter((event) =>
    ["TX_CREATED", "SETTLED_BY_CLAWBACK"].includes(event.type),
  ).length;
  const paidCount = events.filter((event) => event.type === "PAID").length;
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true } } },
  });

  let sent = 0;
  const digestDay = dateOnlyUtc();
  for (const admin of admins) {
    if (!admin.user.email) continue;
    const result = await sendEmail({
      to: admin.user.email,
      subject: "Daily incentive digest - MYSverse DevHub",
      category: "incentive_admin_digest",
      idempotencyKey: `incentive:admin-digest:${digestDay}`,
      react: createElement(IncentiveAdminDigest, {
        eventCount: events.length,
        pendingCount,
        heldCount,
        releasedCount,
        paidCount,
      }),
    });
    if (result.status === "sent") sent++;
  }
  return sent;
}

export type EarnedIncentiveAwardView = {
  id: string;
  type: IncentiveType;
  amount: number;
  currency: string;
  status: IncentiveAwardStatus;
  statusCopy: IncentiveStatusCopy;
};

export interface UserWeeklyIncentiveProgress {
  enabled: boolean;
  weekKey: string;
  completedThisWeek: number;
  threshold: number;
  remaining: number;
  atThreshold: boolean;
  activeDaysThisWeek: number;
  activeDayThreshold: number;
  activeDayKickerEnabled: boolean;
  currentStreakWeeks: number;
  lifetimeCompleted: number;
  currency: CurrencyCode;
  rewardFlags: {
    weeklyEnabled: boolean;
    streakEnabled: boolean;
    milestoneEnabled: boolean;
    leaderboardEnabled: boolean;
  };
  earningPotential: IncentiveEarningPotential;
  nextTargets: IncentiveNextTarget[];
  qualification: IncentiveQualificationSummary;
  suggestions: IncentiveSuggestion[];
  earnedThisWeek: EarnedIncentiveAwardView[];
  badges: string[];
}

export async function getUserWeeklyIncentiveProgress(
  userId: string,
): Promise<UserWeeklyIncentiveProgress> {
  "use cache";

  cacheTag(TAGS.incentiveProgress(userId));
  cacheLife({ revalidate: 300, expire: 3600 });

  const config = await getIncentiveConfig();
  const weekKey = getWeekKey(new Date());
  const activatedAt = config.activatedAt ?? new Date(0);
  const issues = await getQualifyingIssuesForWeek(
    userId,
    weekKey,
    config,
    activatedAt,
  );
  const [
    activeDaysThisWeek,
    currentStreakWeeks,
    lifetimeCompleted,
    awards,
    profile,
  ] = await Promise.all([
    getDistinctActiveDaysForWeek(userId, weekKey),
    getCurrentStreakWeeks(userId, weekKey, config, activatedAt),
    getLifetimeQualifyingCount(userId, config, activatedAt),
    prisma.incentiveAward.findMany({
      where: {
        userId,
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { paymentMethod: true },
    }),
  ]);

  const currency = getCurrencyForPaymentMethod(
    profile?.paymentMethod ?? "BANK_TRANSFER",
  );
  const completedThisWeek = issues.length;
  const remaining = Math.max(0, config.weeklyThreshold - completedThisWeek);

  // Weekly tiers / milestones drive the "next target" + earning-potential copy.
  const tiers = parseWeeklyTiers(config);
  const topTier = tiers.at(-1) ?? {
    threshold: config.weeklyThreshold,
    myr: config.weeklyMyrAmount,
    robux: config.weeklyRobuxAmount,
  };
  const nextTier =
    tiers.find((tier) => completedThisWeek < tier.threshold) ?? null;
  const atThreshold = nextTier == null;

  const kickerAmount =
    currency === "ROBUX"
      ? config.activeDayKickerRobux
      : config.activeDayKickerMyr;
  const kickerEligible =
    config.activeDayKickerEnabled &&
    activeDaysThisWeek >= config.activeDayThreshold;
  const streakAmount =
    currency === "ROBUX" ? config.streakRobuxAmount : config.streakMyrAmount;

  const earningPotential = buildIncentiveEarningPotential({
    currency,
    topTierAmount: currencyAmount(topTier, currency),
    thresholdReached: atThreshold,
    kickerEnabled: config.activeDayKickerEnabled,
    kickerEligible,
    kickerAmount,
  });

  const milestones = parseMilestones(config);
  const nextMilestone =
    milestones.find((milestone) => lifetimeCompleted < milestone.count) ?? null;

  const nextTargets = buildIncentiveNextTargets({
    currency,
    completedThisWeek,
    weekly: {
      enabled: config.weeklyEnabled,
      nextThreshold: nextTier?.threshold ?? null,
      nextAmount: nextTier ? currencyAmount(nextTier, currency) : null,
    },
    streak: {
      enabled: config.streakEnabled,
      thresholdWeeks: config.streakThresholdWeeks,
      currentStreakWeeks,
      amount: streakAmount,
    },
    milestone: {
      enabled: config.milestoneEnabled,
      nextCount: nextMilestone?.count ?? null,
      amount: nextMilestone ? currencyAmount(nextMilestone, currency) : null,
      lifetimeCompleted,
    },
  });

  const earnedThisWeek: EarnedIncentiveAwardView[] = awards
    .filter((award) => award.period === weekKey)
    .map((award) => ({
      id: award.id,
      type: award.type,
      amount: award.amount,
      currency: award.currency,
      status: award.status,
      statusCopy: incentiveStatusCopy(award.status),
    }));
  const badges = [
    ...awards
      .filter((award) => award.type === "MILESTONE")
      .map((award) => `Milestone ${award.period.replace("lifetime:", "")}`),
    ...(currentStreakWeeks > 0 ? [`${currentStreakWeeks}-week streak`] : []),
    ...awards
      .filter((award) => award.type === "LEADERBOARD")
      .slice(0, 3)
      .map(() => "Leaderboard finisher"),
  ].slice(0, 6);

  const qualification: IncentiveQualificationSummary = {
    currency,
    weekKey,
    windowLabel: "Monday to Sunday (UTC)",
    minEstimateToCount: config.minEstimateToCount,
    excludedLabels: config.excludedLabels,
    stabilityLabel: `${config.stabilityMinutes} minute${config.stabilityMinutes === 1 ? "" : "s"}`,
    disputeWindowLabel: `${config.disputeWindowHours} hour${config.disputeWindowHours === 1 ? "" : "s"}`,
    tiers: tiers.map((tier) => ({
      threshold: tier.threshold,
      amountFormatted: formatAmount(currencyAmount(tier, currency), currency),
    })),
    weeklyPotentialFormatted: earningPotential.potentialAmountFormatted,
    activeDayKickerEnabled: config.activeDayKickerEnabled,
    activeDayThreshold: config.activeDayThreshold,
    activeDayKickerAmountFormatted: config.activeDayKickerEnabled
      ? formatAmount(kickerAmount, currency)
      : null,
    streakEnabled: config.streakEnabled,
    streakThresholdWeeks: config.streakThresholdWeeks,
    streakAmountFormatted: config.streakEnabled
      ? formatAmount(streakAmount, currency)
      : null,
    milestoneEnabled: config.milestoneEnabled,
    milestones: milestones.map((milestone) => ({
      count: milestone.count,
      amountFormatted: formatAmount(
        currencyAmount(milestone, currency),
        currency,
      ),
    })),
  };

  const suggestions = buildIncentiveSuggestions({
    enabled: config.enabled,
    completedThisWeek,
    threshold: config.weeklyThreshold,
    remainingToThreshold: remaining,
    thresholdReached: atThreshold,
    weeklyPotentialFormatted: earningPotential.potentialAmountFormatted,
    streakEnabled: config.streakEnabled,
    currentStreakWeeks,
    activeDayKickerEnabled: config.activeDayKickerEnabled,
    activeDayThreshold: config.activeDayThreshold,
    activeDaysThisWeek,
    activeDayKickerFormatted: config.activeDayKickerEnabled
      ? formatAmount(kickerAmount, currency)
      : null,
    earnedStatuses: earnedThisWeek.map((award) => award.status),
  });

  return {
    enabled: config.enabled,
    weekKey,
    completedThisWeek,
    threshold: config.weeklyThreshold,
    remaining,
    atThreshold,
    activeDaysThisWeek,
    activeDayThreshold: config.activeDayThreshold,
    activeDayKickerEnabled: config.activeDayKickerEnabled,
    currentStreakWeeks,
    lifetimeCompleted,
    currency,
    rewardFlags: {
      weeklyEnabled: config.weeklyEnabled,
      streakEnabled: config.streakEnabled,
      milestoneEnabled: config.milestoneEnabled,
      leaderboardEnabled: config.leaderboardEnabled,
    },
    earningPotential,
    nextTargets,
    qualification,
    suggestions,
    earnedThisWeek,
    badges,
  };
}
