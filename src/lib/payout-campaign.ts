import type { DeveloperRank, PayoutCampaignScope } from "@prisma/client";
import { type CurrencyCode, formatAmount, roundAmount } from "./currency";

// Client-safe, Prisma-free core of the limited-time payout multiplier
// campaigns. Window resolution, targeting, multiplier math, and the copy that
// describes them all live here so the admin form, the developer banner, the
// PPT engine, the bonus sync, and the incentive engine cannot disagree about
// which campaign applies or what it pays.
//
// This module MUST stay free of `prisma` and `@/lib/payout-campaign-server`
// (server-only) so client components can import it — the same split as
// payout-policy.ts / payout-policy-server.ts and incentive-copy.ts /
// incentives.ts. It is also the only layer the repo can unit-test, since there
// is no Prisma mocking; keep every decision that matters in here.
//
// Two invariants worth stating up front:
//   * Campaigns NEVER stack. When several are live the highest multiplier
//     wins outright — see selectCampaign.
//   * Server callers must pass server time. `now` defaults to `new Date()` but
//     is always injectable so the window logic stays testable.

export type CampaignScope = PayoutCampaignScope;

/** Hard bounds shared by the zod schema, the admin form, and the tests. */
export const CAMPAIGN_LIMITS = {
  /** Exclusive lower bound — a 1x "campaign" is just noise. */
  minMultiplier: 1,
  maxMultiplier: 5,
  maxDurationDays: 90,
  headline: 120,
  name: 80,
  slug: 60,
  body: 500,
} as const;

// ---------------------------------------------------------------------------
// Window state
// ---------------------------------------------------------------------------

export type CampaignWindow = {
  enabled: boolean;
  startsAt: Date;
  endsAt: Date;
};

export type CampaignWindowState =
  | { active: true; startsAt: Date; endsAt: Date }
  | {
      active: false;
      reason: "disabled" | "not-yet-started" | "ended";
      startsAt: Date;
      endsAt: Date;
    };

/**
 * Whether a campaign is live right now. Pure so the admin preview, the
 * developer banner, and every amount-deciding server path agree.
 *
 * The manual `enabled` toggle wins over the schedule; within the schedule
 * `startsAt` is inclusive and `endsAt` is exclusive. Same semantics as
 * getOrderingWindowState in welcome-pack-ordering.ts — deliberately, so there
 * is one window convention in the codebase rather than two.
 */
export function getCampaignWindowState(
  campaign: CampaignWindow,
  now: Date = new Date(),
): CampaignWindowState {
  const { startsAt, endsAt } = campaign;
  if (!campaign.enabled) {
    return { active: false, reason: "disabled", startsAt, endsAt };
  }
  if (now < startsAt) {
    return { active: false, reason: "not-yet-started", startsAt, endsAt };
  }
  if (now >= endsAt) {
    return { active: false, reason: "ended", startsAt, endsAt };
  }
  return { active: true, startsAt, endsAt };
}

export function isCampaignLive(
  campaign: CampaignWindow,
  now: Date = new Date(),
): boolean {
  return getCampaignWindowState(campaign, now).active;
}

// ---------------------------------------------------------------------------
// Targeting + selection
// ---------------------------------------------------------------------------

export type SelectableCampaign = CampaignWindow & {
  id: string;
  slug: string;
  name: string;
  multiplier: number;
  accentColor: string;
  scopes: CampaignScope[];
  includedLabels: string[];
  excludedLabels: string[];
  ranks: DeveloperRank[];
  participantUserIds: string[];
  createdAt: Date;
};

/** The serializable slice a client badge needs. */
export type CampaignBadgeInfo = {
  slug: string;
  name: string;
  multiplier: number;
  accentColor: string;
  /** ISO — the RSC boundary cannot carry a Date into a client component. */
  endsAt: string;
};

export function toCampaignBadge(
  campaign: SelectableCampaign,
): CampaignBadgeInfo {
  return {
    slug: campaign.slug,
    name: campaign.name,
    multiplier: campaign.multiplier,
    accentColor: campaign.accentColor,
    endsAt: campaign.endsAt.toISOString(),
  };
}

export type CampaignSelectionContext = {
  scope: CampaignScope;
  userId: string;
  rank?: DeveloperRank | null;
  /**
   * Linear issue labels. Ignored for INCENTIVE, whose awards span a whole
   * period rather than one issue — see campaignScopeSupportsLabels.
   */
  labels?: string[] | null;
  now?: Date;
};

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function normalizeLabels(labels: string[] | null | undefined) {
  return new Set((labels ?? []).map(normalizeLabel).filter(Boolean));
}

/**
 * Label filters are meaningless for incentive awards: a weekly throughput
 * award is earned across many issues, so there is no single label set to test.
 * Admins are told this in the campaign form rather than being allowed to
 * configure a filter that silently does nothing.
 */
export function campaignScopeSupportsLabels(scope: CampaignScope): boolean {
  return scope !== "INCENTIVE";
}

export function campaignMatches(
  campaign: SelectableCampaign,
  context: CampaignSelectionContext,
): boolean {
  if (!isCampaignLive(campaign, context.now ?? new Date())) return false;
  if (!campaign.scopes.includes(context.scope)) return false;

  if (
    campaign.participantUserIds.length > 0 &&
    !campaign.participantUserIds.includes(context.userId)
  ) {
    return false;
  }

  // An unknown rank cannot satisfy a rank-restricted campaign.
  if (campaign.ranks.length > 0) {
    if (!context.rank) return false;
    if (!campaign.ranks.includes(context.rank)) return false;
  }

  if (campaignScopeSupportsLabels(context.scope)) {
    const labels = normalizeLabels(context.labels);
    const excluded = campaign.excludedLabels.map(normalizeLabel);
    if (excluded.some((label) => labels.has(label))) return false;

    const included = campaign.includedLabels.map(normalizeLabel);
    if (included.length > 0 && !included.some((label) => labels.has(label))) {
      return false;
    }
  }

  return true;
}

/**
 * The single campaign that applies, or null for the normal 1x rate.
 *
 * Campaigns never stack: the highest multiplier wins outright, ties broken by
 * the most recently created campaign so the result is deterministic and
 * explainable to a developer asking "why did I get 2x and not 3x?".
 */
export function selectCampaign(
  campaigns: SelectableCampaign[],
  context: CampaignSelectionContext,
): SelectableCampaign | null {
  const eligible = campaigns.filter((campaign) =>
    campaignMatches(campaign, context),
  );
  if (eligible.length === 0) return null;

  return eligible.sort(
    (a, b) =>
      b.multiplier - a.multiplier ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )[0];
}

/**
 * Display-only shortcut for server components that already hold the campaign
 * rows: resolve the campaign for one item and hand the client just enough to
 * render a badge. Never a substitute for resolveCampaignForAmount — this
 * ignores the uplift pool, because a preview showing 3x while the budget is
 * exhausted is a smaller sin than an N+1 aggregate per task card.
 */
export function selectCampaignBadge(
  campaigns: SelectableCampaign[],
  context: CampaignSelectionContext,
): CampaignBadgeInfo | null {
  const selected = selectCampaign(campaigns, context);
  return selected ? toCampaignBadge(selected) : null;
}

// ---------------------------------------------------------------------------
// Multiplier math
// ---------------------------------------------------------------------------

/**
 * The multiplied, payable amount. Rounded to what the currency can actually
 * disburse — the base `estimate * rate` math is integral, but a 1.5x campaign
 * is not, and fractional Robux would be rejected by FinSys.
 */
export function applyMultiplier(
  baseAmount: number,
  multiplier: number,
  currency: CurrencyCode,
): number {
  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return roundAmount(baseAmount, currency);
  }
  return roundAmount(baseAmount * multiplier, currency);
}

/** The extra money a campaign costs: what is charged against the pool. */
export function computeUplift(
  baseAmount: number,
  multiplier: number,
  currency: CurrencyCode,
): number {
  return roundAmount(
    applyMultiplier(baseAmount, multiplier, currency) -
      roundAmount(baseAmount, currency),
    currency,
  );
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export type CampaignGuardrails = {
  upliftPoolMyr: number;
  upliftPoolRobux: number;
  perUserUpliftCapMyr: number;
  perUserUpliftCapRobux: number;
};

export type CampaignGuardrailReason = "pool_exhausted" | "user_cap_reached";

/** 0 means unlimited, matching the IncentiveConfig budget convention. */
export function campaignPoolFor(
  guardrails: CampaignGuardrails,
  currency: CurrencyCode,
): number {
  return currency === "ROBUX"
    ? guardrails.upliftPoolRobux
    : guardrails.upliftPoolMyr;
}

export function campaignUserCapFor(
  guardrails: CampaignGuardrails,
  currency: CurrencyCode,
): number {
  return currency === "ROBUX"
    ? guardrails.perUserUpliftCapRobux
    : guardrails.perUserUpliftCapMyr;
}

/**
 * Whether this uplift still fits. Deliberately all-or-nothing: an exhausted
 * pool falls back to the normal 1x rate rather than paying a partial
 * multiplier, because "you got 2.3x because the budget ran out mid-week" is
 * impossible to explain and impossible to predict.
 */
export function checkCampaignGuardrails(input: {
  guardrails: CampaignGuardrails;
  currency: CurrencyCode;
  upliftAmount: number;
  poolSpent: number;
  userSpent: number;
}): CampaignGuardrailReason | null {
  const pool = campaignPoolFor(input.guardrails, input.currency);
  if (pool > 0 && input.poolSpent + input.upliftAmount > pool) {
    return "pool_exhausted";
  }
  const userCap = campaignUserCapFor(input.guardrails, input.currency);
  if (userCap > 0 && input.userSpent + input.upliftAmount > userCap) {
    return "user_cap_reached";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** "3x", "1.5x" — never "3.0x". */
export function formatMultiplier(multiplier: number): string {
  if (!Number.isFinite(multiplier)) return "1x";
  const rounded = Math.round(multiplier * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, "")}x`;
}

export const CAMPAIGN_SCOPE_LABELS: Record<CampaignScope, string> = {
  PPT: "PPT payouts",
  BONUS: "Bonus caps",
  INCENTIVE: "Incentive awards",
};

export function describeCampaignScopes(scopes: CampaignScope[]): string {
  const labels = scopes.map((scope) => CAMPAIGN_SCOPE_LABELS[scope] ?? scope);
  if (labels.length === 0) return "nothing yet";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** "RM20.00 x 3x (Raya Sprint) = RM60.00" — the ledger/slip breakdown line. */
export function campaignAmountBreakdown(input: {
  baseAmount: number;
  multiplier: number;
  finalAmount: number;
  currency: CurrencyCode;
  campaignName: string;
}): string {
  return `${formatAmount(input.baseAmount, input.currency)} x ${formatMultiplier(
    input.multiplier,
  )} (${input.campaignName}) = ${formatAmount(input.finalAmount, input.currency)}`;
}

/** "ends in 3 days" / "ends in 5 hours" / "ending now". */
export function describeCampaignRemaining(
  endsAt: Date,
  now: Date = new Date(),
): string {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return "ending now";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `ends in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `ends in ${days} days`;
}

/** One-line "what developers will see", computed live from admin form state. */
export function campaignDeveloperPreview(campaign: {
  enabled: boolean;
  multiplier: number;
  scopes: CampaignScope[];
  headline: string;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
}): string {
  const state = getCampaignWindowState(campaign, campaign.now ?? new Date());
  if (!state.active) {
    if (state.reason === "disabled") {
      return "Nothing — the campaign is switched off. Developers see the normal rate.";
    }
    if (state.reason === "not-yet-started") {
      return `Nothing yet. From ${state.startsAt.toLocaleString()} developers see "${campaign.headline}".`;
    }
    return "Nothing — the campaign has ended. Developers see the normal rate.";
  }
  return `"${campaign.headline}" — ${formatMultiplier(campaign.multiplier)} on ${describeCampaignScopes(
    campaign.scopes,
  )}, ${describeCampaignRemaining(state.endsAt, campaign.now ?? new Date())}.`;
}

export function campaignGuardrailCopy(reason: CampaignGuardrailReason): {
  title: string;
  explanation: string;
} {
  if (reason === "pool_exhausted") {
    return {
      title: "Campaign budget spent",
      explanation:
        "The campaign's uplift pool for this currency is used up, so this payout was made at the normal rate.",
    };
  }
  return {
    title: "Per-developer campaign cap reached",
    explanation:
      "This developer has already received the maximum campaign uplift, so this payout was made at the normal rate.",
  };
}
