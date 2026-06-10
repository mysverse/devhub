"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import {
  evaluateWeeklyIncentives,
  getIncentiveConfig,
  releaseDueIncentives,
  requestIncentiveClawback as requestClawbackDebt,
  sendIncentiveActivationAlert,
} from "@/lib/incentives";
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
  await requireAdmin();

  const config = await getIncentiveConfig();
  const result = await prisma.incentiveAward.updateMany({
    where: { id: awardId, status: "HELD", transactionId: null },
    data: {
      status: "PENDING",
      heldReason: null,
      releaseAt: new Date(
        Date.now() + Math.max(0, config.disputeWindowHours) * 60 * 60_000,
      ),
    },
  });

  if (result.count === 0) return { error: "Award is not held" };
  await prisma.incentiveEvent.create({
    data: { awardId, type: "HELD_APPROVED", message: "Approved by admin" },
  });
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
  await prisma.incentiveEvent.create({
    data: {
      awardId,
      userId: award.userId,
      type: "CANCELLED",
      period: award.period,
      message: reason?.trim() || null,
    },
  });
  await prisma.incentiveNotification.create({
    data: {
      userId: award.userId,
      awardId,
      type: "INCENTIVE_DISPUTED",
    },
  });
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
