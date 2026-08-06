import type {
  DeveloperRank,
  PayoutCampaign,
  PayoutCampaignScope,
  Prisma,
} from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { TAGS } from "@/lib/cache-tags";
import type { CurrencyCode } from "@/lib/currency";
import {
  applyMultiplier,
  type CampaignScope,
  campaignScopeSupportsLabels,
  checkCampaignGuardrails,
  computeUplift,
  getCampaignWindowState,
  type SelectableCampaign,
  selectCampaign,
} from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";

// Server-side half of the payout campaign feature: reading campaigns, deciding
// which one applies to a specific amount, and keeping the uplift pool ledger.
// Every decision that can be made without the database lives in the pure
// payout-campaign.ts; this module only adds IO.
//
// Cache-Components note: getCampaignRows caches ROWS ONLY and never reads the
// clock. Window state is evaluated by the caller against live server time, so
// a campaign starts and ends on schedule even though its row was cached
// minutes earlier. Caching the *resolved* state instead would make a campaign
// go live up to a full revalidate window late — the same trap the hourly
// getBonusConfig cache would set.

export type CampaignResolution = {
  campaign: PayoutCampaign;
  multiplier: number;
  baseAmount: number;
  finalAmount: number;
  upliftAmount: number;
};

async function getCampaignRowsCached(): Promise<PayoutCampaign[]> {
  "use cache";

  cacheTag(TAGS.payoutCampaigns);
  cacheLife({ revalidate: 300, expire: 3600 });

  return prisma.payoutCampaign.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Enabled campaigns, cached. Callers evaluate the window themselves. */
export const getCampaignRows = cache(getCampaignRowsCached);

/** Every campaign, newest first — admin console only, never cached. */
export async function listCampaigns(): Promise<PayoutCampaign[]> {
  return prisma.payoutCampaign.findMany({ orderBy: { startsAt: "desc" } });
}

function toSelectable(campaign: PayoutCampaign): SelectableCampaign {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    multiplier: campaign.multiplier,
    scopes: campaign.scopes,
    enabled: campaign.enabled,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    includedLabels: campaign.includedLabels,
    excludedLabels: campaign.excludedLabels,
    ranks: campaign.ranks,
    participantUserIds: campaign.participantUserIds,
    createdAt: campaign.createdAt,
  };
}

/**
 * The live campaign for a developer in a scope, ignoring guardrails. This is
 * the display path — banners, badges, projected earnings. Money paths must use
 * resolveCampaignForAmount, which also charges the pool.
 */
export async function getLiveCampaignFor(input: {
  scope: CampaignScope;
  userId: string;
  rank?: string | null;
  labels?: string[] | null;
  now?: Date;
}): Promise<PayoutCampaign | null> {
  const rows = await getCampaignRows();
  const selected = selectCampaign(rows.map(toSelectable), {
    scope: input.scope,
    userId: input.userId,
    rank: (input.rank ?? null) as SelectableCampaign["ranks"][number] | null,
    labels: input.labels,
    now: input.now ?? new Date(),
  });
  if (!selected) return null;
  return rows.find((row) => row.id === selected.id) ?? null;
}

/** Uplift already committed to a campaign in a currency, ignoring reversals. */
export async function getCampaignSpend(
  campaignId: string,
  currency: CurrencyCode,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const result = await tx.payoutCampaignApplication.aggregate({
    where: { campaignId, currency, reverted: false },
    _sum: { upliftAmount: true },
  });
  return result._sum.upliftAmount ?? 0;
}

async function getUserCampaignSpend(
  campaignId: string,
  userId: string,
  currency: CurrencyCode,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const result = await tx.payoutCampaignApplication.aggregate({
    where: { campaignId, userId, currency, reverted: false },
    _sum: { upliftAmount: true },
  });
  return result._sum.upliftAmount ?? 0;
}

/**
 * Decide the campaign for an amount about to be paid, honouring the uplift
 * pool and the per-user cap.
 *
 * Returns null — meaning the normal 1x rate — when nothing applies or a
 * guardrail is hit. Guardrails deliberately fall back rather than blocking the
 * payout: a developer's earned money must never be held hostage to a marketing
 * budget. The reason is logged so the admin ledger can show it happened.
 *
 * Callers must still record the application (recordCampaignApplication), ideally
 * inside the same transaction that writes the amount, so a replay cannot charge
 * the pool twice and a crash between the two cannot leave an uncharged uplift.
 */
export async function resolveCampaignForAmount(input: {
  scope: CampaignScope;
  userId: string;
  currency: CurrencyCode;
  baseAmount: number;
  rank?: string | null;
  labels?: string[] | null;
  /** Campaign membership for incentives is decided by the period end, not the
   *  instant the cron happens to run. */
  now?: Date;
}): Promise<CampaignResolution | null> {
  if (!(input.baseAmount > 0)) return null;

  const campaign = await getLiveCampaignFor({
    scope: input.scope,
    userId: input.userId,
    rank: input.rank,
    labels: input.labels,
    now: input.now,
  });
  if (!campaign) return null;

  const upliftAmount = computeUplift(
    input.baseAmount,
    campaign.multiplier,
    input.currency,
  );
  if (upliftAmount <= 0) return null;

  const [poolSpent, userSpent] = await Promise.all([
    getCampaignSpend(campaign.id, input.currency),
    getUserCampaignSpend(campaign.id, input.userId, input.currency),
  ]);

  const blocked = checkCampaignGuardrails({
    guardrails: campaign,
    currency: input.currency,
    upliftAmount,
    poolSpent,
    userSpent,
  });
  if (blocked) {
    console.info(
      `[campaigns] ${campaign.slug} skipped for user ${input.userId} (${input.scope}, ${input.currency}): ${blocked}`,
    );
    return null;
  }

  return {
    campaign,
    multiplier: campaign.multiplier,
    baseAmount: input.baseAmount,
    finalAmount: applyMultiplier(
      input.baseAmount,
      campaign.multiplier,
      input.currency,
    ),
    upliftAmount,
  };
}

/**
 * Re-apply an already-locked campaign to a (possibly changed) base amount,
 * without re-resolving against the clock.
 *
 * PPT amounts are recomputed after creation — an estimate change or an ON_HOLD
 * release rewrites Transaction.amount. Re-resolving there would silently drop a
 * developer's payout to 1x the moment a campaign expired, so recompute paths
 * read the campaign locked onto PptPayoutState and come through here instead.
 */
export async function applyLockedCampaign(input: {
  campaignId: string | null;
  multiplier: number | null;
  baseAmount: number;
  currency: CurrencyCode;
}): Promise<CampaignResolution | null> {
  if (!input.campaignId || !input.multiplier || input.multiplier <= 1) {
    return null;
  }
  const campaign = await prisma.payoutCampaign.findUnique({
    where: { id: input.campaignId },
  });
  if (!campaign) return null;

  const upliftAmount = computeUplift(
    input.baseAmount,
    input.multiplier,
    input.currency,
  );
  return {
    campaign,
    multiplier: input.multiplier,
    baseAmount: input.baseAmount,
    finalAmount: applyMultiplier(
      input.baseAmount,
      input.multiplier,
      input.currency,
    ),
    upliftAmount,
  };
}

/**
 * Write (or update) the ledger row for one multiplied amount. Idempotent via
 * the unique (campaignId, scope, entityId): a replayed Linear webhook updates
 * the existing row rather than charging the pool a second time.
 */
export async function recordCampaignApplication(
  input: {
    campaignId: string;
    scope: CampaignScope;
    entityId: string;
    userId: string;
    currency: CurrencyCode;
    baseAmount: number;
    multiplier: number;
    upliftAmount: number;
    transactionId?: string | null;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  const data = {
    userId: input.userId,
    currency: input.currency,
    baseAmount: input.baseAmount,
    multiplier: input.multiplier,
    upliftAmount: input.upliftAmount,
    transactionId: input.transactionId ?? null,
    reverted: false,
    revertedAt: null,
  };

  return tx.payoutCampaignApplication.upsert({
    where: {
      campaignId_scope_entityId: {
        campaignId: input.campaignId,
        scope: input.scope,
        entityId: input.entityId,
      },
    },
    create: {
      campaignId: input.campaignId,
      scope: input.scope,
      entityId: input.entityId,
      ...data,
    },
    update: data,
  });
}

/**
 * Release uplift back to the pool when the money never went out — a rejected
 * PPT transaction, a cancelled incentive award. Kept as a soft flag rather than
 * a delete so the admin ledger can still show what was attempted.
 */
export async function revertCampaignApplications(
  input: {
    scope: CampaignScope;
    entityIds: string[];
  },
  tx: Prisma.TransactionClient = prisma,
) {
  if (input.entityIds.length === 0) return { count: 0 };
  return tx.payoutCampaignApplication.updateMany({
    where: {
      scope: input.scope,
      entityId: { in: input.entityIds },
      reverted: false,
    },
    data: { reverted: true, revertedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Cost preview
// ---------------------------------------------------------------------------

export type CampaignCostPreview = {
  lookbackDays: number;
  perCurrency: {
    currency: CurrencyCode;
    matchedCount: number;
    baseSpend: number;
    projectedUplift: number;
    pool: number;
    /** True when the projected uplift would exhaust the configured pool. */
    exceedsPool: boolean;
  }[];
};

type CampaignDraft = {
  multiplier: number;
  scopes: CampaignScope[];
  includedLabels: string[];
  excludedLabels: string[];
  ranks: DeveloperRank[];
  participantUserIds: string[];
  upliftPoolMyr: number;
  upliftPoolRobux: number;
};

function draftMatchesLabels(draft: CampaignDraft, labels: string[]): boolean {
  const normalized = new Set(labels.map((label) => label.trim().toLowerCase()));
  const excluded = draft.excludedLabels.map((label) =>
    label.trim().toLowerCase(),
  );
  if (excluded.some((label) => normalized.has(label))) return false;
  const included = draft.includedLabels.map((label) =>
    label.trim().toLowerCase(),
  );
  if (included.length > 0 && !included.some((label) => normalized.has(label))) {
    return false;
  }
  return true;
}

/**
 * Back-test a draft campaign against real history: "if this had been live for
 * the last N days, it would have cost RM X". The single most useful thing an
 * admin can see before switching on a 3x multiplier.
 *
 * PPT is matched through PptPayoutState (which carries the issue labels);
 * bonuses through approved candidates; incentives through awards. Amounts are
 * the base amounts, so a lookback that overlaps a previous campaign does not
 * compound.
 */
export async function previewCampaignCost(
  draft: CampaignDraft,
  lookbackDays = 30,
): Promise<CampaignCostPreview> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rankFilter =
    draft.ranks.length > 0 ? { developerRank: { in: draft.ranks } } : {};
  const participantFilter =
    draft.participantUserIds.length > 0
      ? { id: { in: draft.participantUserIds } }
      : {};

  const eligibleUsers = await prisma.userProfile.findMany({
    where: { ...rankFilter, ...participantFilter },
    select: { id: true },
  });
  const eligibleUserIds = eligibleUsers.map((user) => user.id);

  const totals = new Map<CurrencyCode, { count: number; base: number }>([
    ["MYR", { count: 0, base: 0 }],
    ["ROBUX", { count: 0, base: 0 }],
  ]);

  function add(currency: string, baseAmount: number) {
    const key: CurrencyCode = currency === "ROBUX" ? "ROBUX" : "MYR";
    const bucket = totals.get(key);
    if (!bucket) return;
    bucket.count += 1;
    bucket.base += baseAmount;
  }

  if (draft.scopes.includes("PPT") && eligibleUserIds.length > 0) {
    const states = await prisma.pptPayoutState.findMany({
      where: {
        userId: { in: eligibleUserIds },
        transactionId: { not: null },
        completedAt: { gte: since },
      },
      select: {
        linearIssueId: true,
        transaction: {
          select: { amount: true, baseAmount: true, currency: true },
        },
      },
    });
    // PptPayoutState has no labels column; IssueCompletion mirrors the Linear
    // labels for the same issue, so join through it to apply label filters.
    const completions = await prisma.issueCompletion.findMany({
      where: { linearIssueId: { in: states.map((s) => s.linearIssueId) } },
      select: { linearIssueId: true, labels: true },
    });
    const labelsByIssue = new Map(
      completions.map((row) => [row.linearIssueId, row.labels]),
    );

    for (const state of states) {
      if (!state.transaction) continue;
      const labels = labelsByIssue.get(state.linearIssueId) ?? [];
      if (!draftMatchesLabels(draft, labels)) continue;
      add(
        state.transaction.currency,
        state.transaction.baseAmount ?? state.transaction.amount,
      );
    }
  }

  if (draft.scopes.includes("BONUS") && eligibleUserIds.length > 0) {
    const candidates = await prisma.bonusCandidate.findMany({
      where: {
        userId: { in: eligibleUserIds },
        status: "APPROVED",
        reviewedAt: { gte: since },
      },
      select: {
        labels: true,
        currency: true,
        approvedAmount: true,
        maxAmount: true,
        baseMaxAmount: true,
      },
    });
    for (const candidate of candidates) {
      if (!draftMatchesLabels(draft, candidate.labels)) continue;
      add(
        candidate.currency,
        candidate.approvedAmount ??
          candidate.baseMaxAmount ??
          candidate.maxAmount,
      );
    }
  }

  if (draft.scopes.includes("INCENTIVE") && eligibleUserIds.length > 0) {
    const awards = await prisma.incentiveAward.findMany({
      where: {
        userId: { in: eligibleUserIds },
        status: { notIn: ["CANCELLED"] },
        createdAt: { gte: since },
      },
      select: { currency: true, amount: true, baseAmount: true },
    });
    for (const award of awards) {
      add(award.currency, award.baseAmount ?? award.amount);
    }
  }

  const perCurrency = [...totals.entries()].map(([currency, bucket]) => {
    const projectedUplift = computeUplift(
      bucket.base,
      draft.multiplier,
      currency,
    );
    const pool =
      currency === "ROBUX" ? draft.upliftPoolRobux : draft.upliftPoolMyr;
    return {
      currency,
      matchedCount: bucket.count,
      baseSpend: bucket.base,
      projectedUplift,
      pool,
      exceedsPool: pool > 0 && projectedUplift > pool,
    };
  });

  return { lookbackDays, perCurrency };
}

// ---------------------------------------------------------------------------
// Admin ledger
// ---------------------------------------------------------------------------

export async function getCampaignLedger(campaignId: string) {
  const [applications, campaign] = await Promise.all([
    prisma.payoutCampaignApplication.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            preferredName: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.payoutCampaign.findUnique({ where: { id: campaignId } }),
  ]);

  const spendByCurrency = new Map<string, number>();
  for (const application of applications) {
    if (application.reverted) continue;
    spendByCurrency.set(
      application.currency,
      (spendByCurrency.get(application.currency) ?? 0) +
        application.upliftAmount,
    );
  }

  return { campaign, applications, spendByCurrency };
}

/** Live campaigns for a scope, used by the lifecycle cron and admin summaries. */
export async function getCampaignsInWindow(
  scope: PayoutCampaignScope | null,
  now = new Date(),
): Promise<PayoutCampaign[]> {
  const rows = await prisma.payoutCampaign.findMany({
    where: { enabled: true },
  });
  return rows.filter((row) => {
    if (!getCampaignWindowState(row, now).active) return false;
    return scope ? row.scopes.includes(scope) : true;
  });
}

export { campaignScopeSupportsLabels };
