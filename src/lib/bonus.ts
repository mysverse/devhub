import type { Issue } from "@linear/sdk";
import type { BonusCandidate, BonusConfig } from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { TAGS } from "@/lib/cache-tags";
import {
  type CurrencyCode,
  formatAmount,
  getCurrencyForPaymentMethod,
  linearEstimateToComplexityLevel,
} from "@/lib/currency";
import { IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";

export const DEFAULT_BONUS_EXCLUDED_LABELS = [
  "Redistributable",
  "Redistributed",
];

const SYSTEM_EXCLUDED_LABELS = ["PPT"];

export type LinearBonusIssueInput = {
  id: string;
  identifier?: string | null;
  title?: string | null;
  url?: string | null;
  estimate?: number | null;
  completedAt?: Date | string | null;
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

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function coerceCompletedAt(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getBonusPeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function formatBonusPeriod(period: string | null | undefined) {
  if (!period) return "Bonus";
  const [year, month] = period.split("-").map((part) => Number(part));
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function getBonusConfigCached(): Promise<BonusConfig> {
  "use cache";

  cacheTag(TAGS.bonusConfig);
  cacheLife({ revalidate: 3600, expire: 86_400 });

  return prisma.bonusConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      enabled: true,
      myrRatePerPoint: 20,
      robuxRatePerPoint: 1200,
      excludedLabels: DEFAULT_BONUS_EXCLUDED_LABELS,
    },
  });
}

export const getBonusConfig = cache(getBonusConfigCached);

export function getEffectiveExcludedLabels(
  config: Pick<BonusConfig, "excludedLabels">,
) {
  const labels = [...DEFAULT_BONUS_EXCLUDED_LABELS, ...config.excludedLabels];
  return [
    ...new Map(labels.map((label) => [normalizeLabel(label), label])).values(),
  ];
}

export function getBonusRateForCurrency(
  config: Pick<BonusConfig, "myrRatePerPoint" | "robuxRatePerPoint">,
  currency: CurrencyCode,
) {
  return currency === "ROBUX"
    ? config.robuxRatePerPoint
    : config.myrRatePerPoint;
}

function isTerminalCandidate(candidate: BonusCandidate | null) {
  return candidate?.status === "APPROVED" || candidate?.status === "REJECTED";
}

async function findAssigneeUser(input: LinearBonusIssueInput) {
  const assigneeLinearId = input.assignee?.id?.trim() || null;
  const assigneeEmail = input.assignee?.email?.trim() || null;
  const whereOr = [
    ...(assigneeLinearId ? [{ linearId: assigneeLinearId }] : []),
    ...(assigneeEmail ? [{ linearEmail: assigneeEmail }] : []),
  ];

  if (whereOr.length === 0) return null;

  return prisma.userProfile.findFirst({
    where: { OR: whereOr },
  });
}

function issueLabelNames(input: LinearBonusIssueInput) {
  return (input.labels ?? [])
    .map((label) => label.name?.trim())
    .filter((name): name is string => !!name);
}

export async function syncBonusCandidateFromLinearIssue(
  input: LinearBonusIssueInput,
) {
  if (!input.id) return null;

  const [config, existing] = await Promise.all([
    getBonusConfig(),
    prisma.bonusCandidate.findUnique({
      where: { linearIssueId: input.id },
    }),
  ]);

  const labels = issueLabelNames(input);
  const completedAt = coerceCompletedAt(input.completedAt);
  const stateType = input.state?.type ?? null;
  const stateName = input.state?.name ?? null;
  const assigneeLinearId = input.assignee?.id?.trim() || null;
  const assigneeEmail = input.assignee?.email?.trim() || null;
  // Never fall back to the email address: this column is rendered as a
  // display name in admin views and notifications.
  const assigneeName =
    input.assignee?.displayName?.trim() || input.assignee?.name?.trim() || null;

  const baseData = {
    linearIssueIdentifier: input.identifier ?? null,
    linearIssueTitle: input.title ?? null,
    linearIssueUrl: input.url ?? null,
    linearIssueStateType: stateType,
    linearIssueStateName: stateName,
    labels,
    estimate: Number.isInteger(input.estimate) ? input.estimate : null,
    assigneeLinearId,
    assigneeEmail,
    assigneeName,
    completedAt,
  };

  if (existing && isTerminalCandidate(existing)) {
    return prisma.bonusCandidate.update({
      where: { id: existing.id },
      data: baseData,
    });
  }

  let status: "ELIGIBLE" | "READY_FOR_REVIEW" | "INELIGIBLE" = "INELIGIBLE";
  let ineligibilityReason: string | null = null;
  let userId: string | null = null;
  let currency: CurrencyCode = "MYR";
  let maxAmount = 0;
  let period: string | null = null;

  const normalizedLabels = new Set(labels.map(normalizeLabel));
  const configuredExcluded = getEffectiveExcludedLabels(config);
  const excludedLabels = [...SYSTEM_EXCLUDED_LABELS, ...configuredExcluded];
  const matchingExcluded = excludedLabels.find((label) =>
    normalizedLabels.has(normalizeLabel(label)),
  );
  const estimate =
    Number.isInteger(input.estimate) && input.estimate ? input.estimate : null;

  if (!config.enabled) {
    ineligibilityReason = "Bonuses are disabled";
  } else if (!assigneeLinearId && !assigneeEmail) {
    ineligibilityReason = "No assignee";
  } else if (matchingExcluded) {
    ineligibilityReason =
      normalizeLabel(matchingExcluded) === "ppt"
        ? "PPT task"
        : `Excluded label: ${matchingExcluded}`;
  } else if (stateType === "canceled") {
    ineligibilityReason = "Canceled issue";
  } else if (!estimate || estimate < 1 || estimate > 5) {
    ineligibilityReason = "Missing complexity estimate";
  } else {
    const user = await findAssigneeUser(input);
    if (!user) {
      ineligibilityReason = "Assignee is not linked to DevHub";
    } else {
      const pptTransaction = await prisma.transaction.findFirst({
        where: {
          linearIssueId: input.id,
          source: "PPT",
          status: { not: "REJECTED" },
        },
        select: { id: true },
      });

      if (pptTransaction) {
        ineligibilityReason = "Already paid via PPT";
      } else {
        userId = user.id;
        currency = getCurrencyForPaymentMethod(user.paymentMethod);
        maxAmount = estimate * getBonusRateForCurrency(config, currency);
        const periodDate =
          stateType === "completed" ? (completedAt ?? new Date()) : new Date();
        period = getBonusPeriod(periodDate);
        status = stateType === "completed" ? "READY_FOR_REVIEW" : "ELIGIBLE";
      }
    }
  }

  const candidate = existing
    ? await prisma.bonusCandidate.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          userId,
          currency,
          maxAmount,
          approvedAmount: null,
          status,
          ineligibilityReason,
          period,
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null,
          transactionId: null,
        },
      })
    : await prisma.bonusCandidate.create({
        data: {
          linearIssueId: input.id,
          ...baseData,
          userId,
          currency,
          maxAmount,
          status,
          ineligibilityReason,
          period,
        },
      });

  const shouldNotify =
    status === "ELIGIBLE" &&
    !!candidate.userId &&
    (!existing ||
      (existing.status !== "ELIGIBLE" &&
        existing.status !== "READY_FOR_REVIEW"));

  if (shouldNotify) {
    const currencyCode =
      candidate.currency === "ROBUX" ? "ROBUX" : ("MYR" as CurrencyCode);
    await notify({
      userId: candidate.userId as string,
      domain: "bonus",
      type: "NEW_ELIGIBLE_BONUS",
      title:
        candidate.linearIssueTitle ||
        candidate.linearIssueIdentifier ||
        "Bonus task",
      message: `Up to ${formatAmount(candidate.maxAmount, currencyCode)} is available for review.`,
      href: "/dashboard/bonuses",
      entityType: "bonus_candidate",
      entityId: candidate.id,
      payload: {
        candidateId: candidate.id,
        identifier: candidate.linearIssueIdentifier,
        issueTitle: candidate.linearIssueTitle,
        amount: candidate.maxAmount,
        currency: candidate.currency,
      },
      dedupeKey: `bonus:new-eligible:${candidate.userId}:${candidate.id}`,
      channels: [IN_APP_CHANNEL],
      resetReadOnDedupe: true,
    });
  }

  return candidate;
}

export async function syncBonusCandidateFromLinearSdkIssue(issue: Issue) {
  const [state, labels, assignee] = await Promise.all([
    issue.state,
    issue.labels(),
    issue.assignee,
  ]);

  const issueWithCompletedAt = issue as Issue & {
    completedAt?: Date | string | null;
  };
  const assigneeWithEmail = assignee as
    | (NonNullable<typeof assignee> & { email?: string | null })
    | null;

  return syncBonusCandidateFromLinearIssue({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    estimate: linearEstimateToComplexityLevel(issue.estimate ?? null),
    completedAt: issueWithCompletedAt.completedAt ?? null,
    state: state
      ? {
          type: state.type ?? null,
          name: state.name ?? null,
        }
      : null,
    assignee: assignee
      ? {
          id: assignee.id,
          email: assigneeWithEmail?.email ?? null,
          name: assignee.name,
          displayName: assignee.displayName,
        }
      : null,
    labels: labels.nodes.map((label) => ({ name: label.name })),
  });
}
