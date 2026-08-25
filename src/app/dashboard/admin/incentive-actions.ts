"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  evaluateWeeklyIncentives,
  formatAwardType,
  getIncentiveConfig,
  releaseDueIncentives,
  requestIncentiveClawback as requestClawbackDebt,
  sendIncentiveActivationAlert,
} from "@/lib/incentives";
import { IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { revertCampaignApplications } from "@/lib/payout-campaign-server";
import prisma from "@/lib/prisma";

type IncentiveConfigInput = {
  enabled: boolean;
  weeklyEnabled: boolean;
  weeklyThreshold: number;
  weeklyMyrAmount: number;
  weeklyRobuxAmount: number;
  streakEnabled: boolean;
  streakThresholdWeeks: number;
  streakMyrAmount: number;
  streakRobuxAmount: number;
  milestoneEnabled: boolean;
  milestonesText?: string;
  leaderboardEnabled: boolean;
  leaderboardTopN: number;
  leaderboardMyrAmount: number;
  leaderboardRobuxAmount: number;
  activeDayKickerEnabled: boolean;
  activeDayThreshold: number;
  activeDayKickerMyr: number;
  activeDayKickerRobux: number;
  minEstimateToCount: number;
  excludedLabels: string[];
  stabilityMinutes: number;
  disputeWindowHours: number;
  autoPayout: boolean;
  perUserWeeklyCapMyr: number;
  perUserWeeklyCapRobux: number;
  perUserMonthlyCapMyr: number;
  perUserMonthlyCapRobux: number;
  programWeeklyBudgetMyr: number;
  programWeeklyBudgetRobux: number;
  programMonthlyBudgetMyr: number;
  programMonthlyBudgetRobux: number;
  anomalyMultiplier: number;
  anomalyMinBaselineWeeks: number;
  noEstimateRatioFlag: number;
  clawbackMode: "NET_NEXT" | "MANUAL_ADJUSTMENT";
};

function numberOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function integerOr(value: number, fallback: number) {
  return Math.max(0, Math.floor(numberOr(value, fallback)));
}

function parseMilestones(text?: string) {
  if (!text?.trim()) return undefined;
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Milestones must be a JSON array");
  }
  return parsed;
}

function revalidateIncentivePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/admin");
}

/**
 * The developer's incentive card is `"use cache"` with a five-minute revalidate,
 * keyed on this tag. Without the explicit bust, an admin decision takes up to
 * five minutes (and up to an hour past `expire`) to reach the person it is
 * about — which is most of the reason a status looked stuck.
 */
function revalidateDeveloperIncentives(userId: string) {
  try {
    updateTag(TAGS.incentiveProgress(userId));
  } catch (error) {
    // Never let a cache bust take down the write that already committed.
    console.error("[incentives] Failed to revalidate progress tag:", error);
  }
}

export async function updateIncentiveConfig(input: IncentiveConfigInput) {
  await requireAdmin();

  try {
    const existing = await getIncentiveConfig();
    const enablingForFirstTime =
      input.enabled && !existing.enabled && !existing.activatedAt;
    const activatedAt = enablingForFirstTime
      ? new Date()
      : existing.activatedAt;

    await prisma.incentiveConfig.update({
      where: { id: "default" },
      data: {
        enabled: input.enabled,
        activatedAt,
        weeklyEnabled: input.weeklyEnabled,
        weeklyThreshold: Math.max(1, integerOr(input.weeklyThreshold, 5)),
        weeklyMyrAmount: numberOr(input.weeklyMyrAmount, 30),
        weeklyRobuxAmount: numberOr(input.weeklyRobuxAmount, 1800),
        streakEnabled: input.streakEnabled,
        streakThresholdWeeks: Math.max(
          1,
          integerOr(input.streakThresholdWeeks, 4),
        ),
        streakMyrAmount: numberOr(input.streakMyrAmount, 50),
        streakRobuxAmount: numberOr(input.streakRobuxAmount, 3000),
        milestoneEnabled: input.milestoneEnabled,
        milestones: parseMilestones(input.milestonesText),
        leaderboardEnabled: input.leaderboardEnabled,
        leaderboardTopN: Math.max(1, integerOr(input.leaderboardTopN, 3)),
        leaderboardMyrAmount: numberOr(input.leaderboardMyrAmount, 40),
        leaderboardRobuxAmount: numberOr(input.leaderboardRobuxAmount, 2400),
        activeDayKickerEnabled: input.activeDayKickerEnabled,
        activeDayThreshold: Math.max(1, integerOr(input.activeDayThreshold, 3)),
        activeDayKickerMyr: numberOr(input.activeDayKickerMyr, 5),
        activeDayKickerRobux: numberOr(input.activeDayKickerRobux, 300),
        minEstimateToCount: Math.max(1, integerOr(input.minEstimateToCount, 1)),
        excludedLabels: input.excludedLabels
          .map((label) => label.trim())
          .filter(Boolean),
        stabilityMinutes: integerOr(input.stabilityMinutes, 60),
        disputeWindowHours: integerOr(input.disputeWindowHours, 48),
        autoPayout: input.autoPayout,
        perUserWeeklyCapMyr: numberOr(input.perUserWeeklyCapMyr, 150),
        perUserWeeklyCapRobux: numberOr(input.perUserWeeklyCapRobux, 9000),
        perUserMonthlyCapMyr: numberOr(input.perUserMonthlyCapMyr, 400),
        perUserMonthlyCapRobux: numberOr(input.perUserMonthlyCapRobux, 24000),
        programWeeklyBudgetMyr: numberOr(input.programWeeklyBudgetMyr, 0),
        programWeeklyBudgetRobux: numberOr(input.programWeeklyBudgetRobux, 0),
        programMonthlyBudgetMyr: numberOr(input.programMonthlyBudgetMyr, 0),
        programMonthlyBudgetRobux: numberOr(input.programMonthlyBudgetRobux, 0),
        anomalyMultiplier: numberOr(input.anomalyMultiplier, 3),
        anomalyMinBaselineWeeks: integerOr(input.anomalyMinBaselineWeeks, 2),
        noEstimateRatioFlag: Math.min(
          1,
          Math.max(0, numberOr(input.noEstimateRatioFlag, 0.5)),
        ),
        clawbackMode: input.clawbackMode,
      },
    });

    if (enablingForFirstTime && activatedAt) {
      await sendIncentiveActivationAlert(activatedAt);
    }

    revalidateIncentivePaths();
    updateTag(TAGS.incentiveConfig);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to update incentive config",
    };
  }
}

export async function approveHeldIncentiveAward(awardId: string) {
  const adminUserId = await requireAdmin();

  const award = await prisma.incentiveAward.findUnique({
    where: { id: awardId },
    select: {
      status: true,
      heldReason: true,
      userId: true,
      period: true,
      type: true,
      amount: true,
      currency: true,
    },
  });
  if (!award) return { error: "Award not found" };
  if (award.status !== "HELD") return { error: "Award is not held" };
  // Approving cannot rescue this one. The release path re-checks the counted
  // issues for every award, approved or not, so an award whose issues no longer
  // stand would be approved, released, and held again an hour later — the same
  // loop this change exists to end, just running faster.
  if (award.heldReason === "issue_invalidated") {
    return {
      error:
        "The counted issues are no longer valid (reopened, cancelled, or reassigned). Fix the issue in Linear or cancel this award — approving cannot release it.",
    };
  }

  const now = new Date();
  // The compare-and-set on HELD is the idempotency key: a double-click, a
  // retry, or two admins clicking at once all produce exactly one approval.
  // Deliberately not guarded on `approvedAt: null` — an award that was approved,
  // released, and later re-held is a legitimate second approval.
  const result = await prisma.incentiveAward.updateMany({
    where: { id: awardId, status: "HELD", transactionId: null },
    data: {
      status: "PENDING",
      heldReason: null,
      approvedAt: now,
      approvedById: adminUserId,
      // Not now + disputeWindowHours. The review window is what the hold was
      // for, and this award has already served it; restarting it made an
      // approval look, to the developer, exactly like nothing happening.
      releaseAt: now,
      claimedAt: null,
      releaseClaimId: null,
    },
  });

  if (result.count === 0) return { error: "Award is no longer held" };

  await prisma.incentiveEvent.create({
    data: {
      awardId,
      userId: award.userId,
      actorId: adminUserId,
      type: "HELD_APPROVED",
      period: award.period,
      message: award.heldReason,
      metadata: { previousHeldReason: award.heldReason },
    },
  });
  await notify({
    userId: award.userId,
    actorId: adminUserId,
    domain: "incentive",
    type: "INCENTIVE_APPROVED",
    title: formatAwardType(award.type),
    message: `${formatAmount(award.amount, award.currency as CurrencyCode)} was approved and pays out on the next release run.`,
    href: "/dashboard",
    entityType: "incentive_award",
    entityId: awardId,
    dedupeKey: `incentive:INCENTIVE_APPROVED:${award.userId}:${awardId}`,
    channels: [IN_APP_CHANNEL],
  });
  revalidateDeveloperIncentives(award.userId);
  revalidateIncentivePaths();
  return { success: true };
}

export async function disputeIncentiveAward(awardId: string, reason?: string) {
  const adminUserId = await requireAdmin();

  const award = await prisma.incentiveAward.findUnique({
    where: { id: awardId },
  });
  if (!award) return { error: "Award not found" };

  if (award.status === "PAID") {
    const result = await requestClawbackDebt(
      awardId,
      adminUserId,
      reason?.trim() || undefined,
    );
    revalidateDeveloperIncentives(award.userId);
    revalidateIncentivePaths();
    return result;
  }

  if (!["PENDING", "HELD"].includes(award.status)) {
    return {
      error:
        "Only pending or held awards can be cancelled. Reject the linked payout transaction for released awards.",
    };
  }

  const result = await prisma.incentiveAward.updateMany({
    where: { id: awardId, status: { in: ["PENDING", "HELD"] } },
    data: {
      status: "CANCELLED",
      disputedById: adminUserId,
      disputedAt: new Date(),
      disputeReason: reason?.trim() || null,
      releaseAt: null,
    },
  });

  if (result.count === 0) return { error: "Award is no longer cancellable" };
  // Cancelled before payout, so its campaign uplift returns to the pool.
  await revertCampaignApplications({
    scope: "INCENTIVE",
    entityIds: [awardId],
  });
  await prisma.incentiveEvent.create({
    data: {
      awardId,
      userId: award.userId,
      type: "CANCELLED",
      period: award.period,
      message: reason?.trim() || null,
    },
  });
  await notify({
    userId: award.userId,
    actorId: adminUserId,
    domain: "incentive",
    type: "INCENTIVE_DISPUTED",
    title: formatAwardType(award.type),
    message:
      reason?.trim() || "This incentive award was cancelled by an admin.",
    href: "/dashboard",
    entityType: "incentive_award",
    entityId: awardId,
    payload: {
      awardId,
      awardType: award.type,
      period: award.period,
      amount: award.amount,
      currency: award.currency,
      status: "CANCELLED",
    },
    dedupeKey: `incentive:INCENTIVE_DISPUTED:${award.userId}:${awardId}`,
    channels: [IN_APP_CHANNEL],
  });
  revalidateDeveloperIncentives(award.userId);
  revalidateIncentivePaths();
  return { success: true };
}

export async function requestIncentiveClawback(
  awardId: string,
  reason?: string,
) {
  const adminUserId = await requireAdmin();
  const result = await requestClawbackDebt(
    awardId,
    adminUserId,
    reason?.trim() || undefined,
  );
  revalidateIncentivePaths();
  return result;
}

export async function retriggerWeeklyIncentives(weekKey: string) {
  await requireAdmin();

  try {
    const result = await evaluateWeeklyIncentives(weekKey.trim());
    revalidateIncentivePaths();
    return result;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to re-run incentive evaluation",
    };
  }
}

export async function releasePendingIncentives() {
  await requireAdmin();
  const result = await releaseDueIncentives();
  revalidateIncentivePaths();
  return result;
}
