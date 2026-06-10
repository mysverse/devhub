"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import {
  DEFAULT_BONUS_EXCLUDED_LABELS,
  formatBonusPeriod,
  getBonusConfig,
  syncBonusCandidateFromLinearSdkIssue,
} from "@/lib/bonus";
import { TAGS } from "@/lib/cache-tags";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import prisma from "@/lib/prisma";

function revalidateBonusPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bonuses");
  revalidatePath("/dashboard/admin");
}

function cleanLabels(labels: string[]) {
  const deduped = new Map<string, string>();
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    deduped.set(trimmed.toLowerCase(), trimmed);
  }
  return [...deduped.values()];
}

function normalizeApprovedAmount(amount: number, currency: string) {
  if (currency === "ROBUX") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export async function updateBonusConfig(data: {
  enabled: boolean;
  myrRatePerPoint: number;
  robuxRatePerPoint: number;
  excludedLabels: string[];
}) {
  await requireAdmin();

  if (!Number.isFinite(data.myrRatePerPoint) || data.myrRatePerPoint <= 0) {
    return { error: "MYR rate must be greater than 0" };
  }
  if (!Number.isFinite(data.robuxRatePerPoint) || data.robuxRatePerPoint <= 0) {
    return { error: "Robux rate must be greater than 0" };
  }

  const labels = cleanLabels([
    ...DEFAULT_BONUS_EXCLUDED_LABELS,
    ...data.excludedLabels,
  ]);

  await prisma.bonusConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: data.enabled,
      myrRatePerPoint: data.myrRatePerPoint,
      robuxRatePerPoint: data.robuxRatePerPoint,
      excludedLabels: labels,
    },
    update: {
      enabled: data.enabled,
      myrRatePerPoint: data.myrRatePerPoint,
      robuxRatePerPoint: data.robuxRatePerPoint,
      excludedLabels: labels,
    },
  });

  revalidateBonusPaths();
  updateTag(TAGS.bonusConfig);
  return { success: true };
}

export async function refreshBonusCandidatesFromLinear() {
  const adminUserId = await requireAdmin();

  try {
    const count = await withLinearFallback(adminUserId, async (client) => {
      const response = await client.issues({
        first: 100,
        filter: {
          assignee: { null: false },
        },
      });

      await Promise.all(
        response.nodes.map((issue) =>
          syncBonusCandidateFromLinearSdkIssue(issue),
        ),
      );

      return response.nodes.length;
    });

    revalidateBonusPaths();
    return { success: true, count };
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      return {
        error:
          "Linear reauthentication required. Please reconnect your Linear account.",
        reauth: true,
      };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to refresh bonus candidates",
    };
  }
}

export async function approveMonthlyBonus(data: {
  userId: string;
  currency: string;
  period: string;
  items: { candidateId: string; amount: number }[];
}) {
  const adminUserId = await requireAdmin();

  if (!data.userId || !data.currency || !data.period) {
    return { error: "Missing approval target" };
  }

  const uniqueItems = [
    ...new Map(data.items.map((item) => [item.candidateId, item])).values(),
  ];
  if (uniqueItems.length === 0) {
    return { error: "Select at least one bonus item" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const candidates = await tx.bonusCandidate.findMany({
        where: {
          id: { in: uniqueItems.map((item) => item.candidateId) },
          userId: data.userId,
          currency: data.currency,
          period: data.period,
          status: "READY_FOR_REVIEW",
          transactionId: null,
        },
        orderBy: { completedAt: "asc" },
      });

      if (candidates.length !== uniqueItems.length) {
        throw new Error("One or more bonus items are no longer reviewable");
      }

      const amountByCandidate = new Map(
        uniqueItems.map((item) => [
          item.candidateId,
          normalizeApprovedAmount(Number(item.amount), data.currency),
        ]),
      );

      let total = 0;
      for (const candidate of candidates) {
        const amount = amountByCandidate.get(candidate.id);
        if (!amount || amount <= 0) {
          throw new Error("Approved amounts must be greater than 0");
        }
        if (amount > candidate.maxAmount) {
          throw new Error(
            `${candidate.linearIssueIdentifier || candidate.linearIssueTitle || "Bonus item"} exceeds its cap`,
          );
        }
        total += amount;
      }

      total = normalizeApprovedAmount(total, data.currency);
      const periodLabel = formatBonusPeriod(data.period);
      const taskLabel = `${candidates.length} task${candidates.length === 1 ? "" : "s"}`;

      const transaction = await tx.transaction.create({
        data: {
          userId: data.userId,
          amount: total,
          currency: data.currency,
          source: "BONUS",
          bonusPeriod: data.period,
          status: "PENDING",
          autoApproved: false,
          linearIssueIdentifier: `BONUS-${data.period}`,
          linearIssueTitle: `${periodLabel} Bonus - ${taskLabel}`,
        },
      });

      for (const candidate of candidates) {
        await tx.bonusCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "APPROVED",
            approvedAmount: amountByCandidate.get(candidate.id),
            reviewedById: adminUserId,
            reviewedAt: new Date(),
            transactionId: transaction.id,
            rejectionReason: null,
          },
        });
      }

      return transaction;
    });

    revalidateBonusPaths();
    return { success: true, transactionId: result.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to approve bonus",
    };
  }
}

export async function rejectBonusCandidate(
  candidateId: string,
  reason?: string,
) {
  const adminUserId = await requireAdmin();

  const result = await prisma.bonusCandidate.updateMany({
    where: {
      id: candidateId,
      status: { in: ["ELIGIBLE", "READY_FOR_REVIEW"] },
      transactionId: null,
    },
    data: {
      status: "REJECTED",
      reviewedById: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: reason?.trim() || null,
    },
  });

  if (result.count === 0) {
    return { error: "Bonus item is not reviewable" };
  }

  revalidateBonusPaths();
  return { success: true };
}

export async function getCurrentBonusConfig() {
  await requireAdmin();
  return getBonusConfig();
}
