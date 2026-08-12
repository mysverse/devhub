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
import type { CurrencyCode } from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { isLlmConfigured } from "@/lib/llm";
import type { BonusMonthSummary } from "@/lib/llm-prompts";
import { summarizeBonusMonth } from "@/lib/llm-suggestions";
import {
  recordCampaignApplication,
  revertCampaignApplications,
} from "@/lib/payout-campaign-server";
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

      // PPT and bonus are mutually exclusive, but the only thing enforcing
      // that on the bonus side is the Linear webhook re-sync — which flips a
      // candidate to INELIGIBLE once the PPT label lands. A webhook that was
      // dropped, retried past its window, or threw before reaching the bonus
      // sync leaves the candidate READY_FOR_REVIEW with a PPT already paid
      // for the same issue. This is the last point where that is catchable,
      // and paying both is not recoverable.
      const pptPaid = await tx.transaction.findFirst({
        where: {
          linearIssueId: {
            in: candidates.map((candidate) => candidate.linearIssueId),
          },
          source: "PPT",
          status: { not: "REJECTED" },
        },
        select: { linearIssueId: true },
      });
      if (pptPaid) {
        const clash = candidates.find(
          (candidate) => candidate.linearIssueId === pptPaid.linearIssueId,
        );
        throw new Error(
          `${clash?.linearIssueIdentifier || clash?.linearIssueTitle || "A selected item"} already has a PPT payout — it cannot also be paid as a bonus.`,
        );
      }

      const amountByCandidate = new Map(
        uniqueItems.map((item) => [
          item.candidateId,
          normalizeApprovedAmount(Number(item.amount), data.currency),
        ]),
      );

      const currencyCode: CurrencyCode =
        data.currency === "ROBUX" ? "ROBUX" : "MYR";

      let total = 0;
      let totalBase = 0;
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
        // A campaign raises the cap; the uplift it actually costs is only the
        // part of the approved amount that the normal cap could not have
        // covered. Approving below the old cap under a 3x campaign spends
        // nothing from the pool.
        totalBase += Math.min(amount, candidate.baseMaxAmount ?? amount);
      }

      total = normalizeApprovedAmount(total, data.currency);
      totalBase = normalizeApprovedAmount(totalBase, data.currency);
      const periodLabel = formatBonusPeriod(data.period);
      const taskLabel = `${candidates.length} task${candidates.length === 1 ? "" : "s"}`;

      // A grouped bonus can in principle span candidates priced under
      // different campaigns; only attribute the transaction when they agree.
      const campaignIds = new Set(
        candidates.map((candidate) => candidate.campaignId).filter(Boolean),
      );
      const sharedCampaignId =
        campaignIds.size === 1 ? [...campaignIds][0] : null;
      const sharedMultiplier = sharedCampaignId
        ? (candidates.find(
            (candidate) => candidate.campaignId === sharedCampaignId,
          )?.campaignMultiplier ?? null)
        : null;

      const transaction = await tx.transaction.create({
        data: {
          userId: data.userId,
          amount: total,
          baseAmount: totalBase,
          campaignId: sharedCampaignId,
          campaignMultiplier: sharedMultiplier,
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
        const amount = amountByCandidate.get(candidate.id) ?? 0;
        await tx.bonusCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "APPROVED",
            approvedAmount: amount,
            reviewedById: adminUserId,
            reviewedAt: new Date(),
            transactionId: transaction.id,
            rejectionReason: null,
          },
        });

        const base = candidate.baseMaxAmount ?? amount;
        const uplift = normalizeApprovedAmount(
          Math.max(0, amount - base),
          data.currency,
        );
        if (
          candidate.campaignId &&
          candidate.campaignMultiplier &&
          uplift > 0
        ) {
          await recordCampaignApplication(
            {
              campaignId: candidate.campaignId,
              scope: "BONUS",
              entityId: candidate.id,
              userId: data.userId,
              currency: currencyCode,
              baseAmount: Math.min(amount, base),
              multiplier: candidate.campaignMultiplier,
              upliftAmount: uplift,
              transactionId: transaction.id,
            },
            tx,
          );
        }
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

  // Nothing is paid, so any uplift held for this candidate goes back.
  await revertCampaignApplications({
    scope: "BONUS",
    entityIds: [candidateId],
  });

  revalidateBonusPaths();
  return { success: true };
}

export async function getCurrentBonusConfig() {
  await requireAdmin();
  return getBonusConfig();
}

/**
 * Themes and questions over one developer-month of bonus candidates.
 *
 * Advisory only, and structurally incapable of proposing money: the prompt
 * type has no amount field, so there is nothing to prefill even by mistake.
 * approveMonthlyBonus and its in-transaction PPT check are untouched — that
 * check is the last point where double payment is catchable.
 */
export async function summarizeBonusMonthForAdmin(input: {
  userId: string;
  currency: string;
  period: string;
}): Promise<
  { available: false } | { available: true; summary: BonusMonthSummary | null }
> {
  const adminUserId = await requireAdmin();
  if (!isLlmConfigured()) return { available: false };

  const candidates = await prisma.bonusCandidate.findMany({
    where: {
      userId: input.userId,
      currency: input.currency,
      period: input.period,
      status: "READY_FOR_REVIEW",
    },
    select: {
      linearIssueIdentifier: true,
      linearIssueTitle: true,
      labels: true,
      estimate: true,
    },
  });
  if (candidates.length === 0) return { available: true, summary: null };

  const items = candidates.map((candidate) => ({
    identifier: candidate.linearIssueIdentifier ?? "(unknown)",
    title: candidate.linearIssueTitle ?? "(untitled)",
    labelNames: candidate.labels,
    estimate: candidate.estimate,
  }));

  const summary = await summarizeBonusMonth(
    { period: input.period, items },
    adminUserId,
  );
  if (!summary) return { available: true, summary: null };

  // The model is never trusted with a reference. Anything it returns that was
  // not in what we sent is dropped, and a theme left with nothing in it goes
  // with it.
  const sent = new Set(items.map((item) => item.identifier));
  const themes = summary.themes
    .map((theme) => ({
      label: theme.label,
      identifiers: theme.identifiers.filter((identifier) =>
        sent.has(identifier),
      ),
    }))
    .filter((theme) => theme.identifiers.length > 0);

  return { available: true, summary: { ...summary, themes } };
}
