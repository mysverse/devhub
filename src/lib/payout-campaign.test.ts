import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyMultiplier,
  type CampaignSelectionContext,
  campaignAmountBreakdown,
  campaignMatches,
  campaignScopeSupportsLabels,
  checkCampaignGuardrails,
  computeUplift,
  describeCampaignRemaining,
  formatMultiplier,
  getCampaignWindowState,
  type SelectableCampaign,
  selectCampaign,
} from "./payout-campaign";

const START = new Date("2026-08-01T00:00:00.000Z");
const END = new Date("2026-08-31T00:00:00.000Z");
const DURING = new Date("2026-08-15T12:00:00.000Z");
const BEFORE = new Date("2026-07-31T23:59:59.999Z");

function campaign(
  overrides: Partial<SelectableCampaign> = {},
): SelectableCampaign {
  return {
    id: "c1",
    slug: "raya-sprint",
    name: "Raya Sprint",
    multiplier: 3,
    accentColor: "violet",
    scopes: ["PPT"],
    enabled: true,
    startsAt: START,
    endsAt: END,
    includedLabels: [],
    excludedLabels: [],
    ranks: [],
    participantUserIds: [],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function context(
  overrides: Partial<CampaignSelectionContext> = {},
): CampaignSelectionContext {
  return { scope: "PPT", userId: "user1", now: DURING, ...overrides };
}

// ── Window ─────────────────────────────────────────────────────────────────

test("startsAt is inclusive and endsAt is exclusive", () => {
  assert.equal(getCampaignWindowState(campaign(), START).active, true);
  assert.equal(getCampaignWindowState(campaign(), DURING).active, true);

  const atEnd = getCampaignWindowState(campaign(), END);
  assert.equal(atEnd.active, false);
  assert.equal(atEnd.active === false && atEnd.reason, "ended");

  const before = getCampaignWindowState(campaign(), BEFORE);
  assert.equal(before.active, false);
  assert.equal(before.active === false && before.reason, "not-yet-started");
});

test("the enabled toggle wins over the schedule", () => {
  const state = getCampaignWindowState(campaign({ enabled: false }), DURING);
  assert.equal(state.active, false);
  assert.equal(state.active === false && state.reason, "disabled");
});

// ── Targeting ──────────────────────────────────────────────────────────────

test("scope must be listed on the campaign", () => {
  const c = campaign({ scopes: ["BONUS", "INCENTIVE"] });
  assert.equal(campaignMatches(c, context({ scope: "PPT" })), false);
  assert.equal(campaignMatches(c, context({ scope: "BONUS" })), true);
});

test("an empty participant list means everyone", () => {
  assert.equal(campaignMatches(campaign(), context()), true);
  const restricted = campaign({ participantUserIds: ["user2"] });
  assert.equal(campaignMatches(restricted, context()), false);
  assert.equal(campaignMatches(restricted, context({ userId: "user2" })), true);
});

test("a rank-restricted campaign never matches an unknown rank", () => {
  const c = campaign({ ranks: ["SENIOR_DEVELOPER"] });
  assert.equal(campaignMatches(c, context({ rank: null })), false);
  assert.equal(
    campaignMatches(c, context({ rank: "JUNIOR_DEVELOPER" })),
    false,
  );
  assert.equal(campaignMatches(c, context({ rank: "SENIOR_DEVELOPER" })), true);
});

test("included labels gate, excluded labels veto, both case-insensitively", () => {
  const included = campaign({ includedLabels: ["Docs"] });
  assert.equal(campaignMatches(included, context({ labels: ["docs"] })), true);
  assert.equal(
    campaignMatches(included, context({ labels: ["Infra"] })),
    false,
  );
  assert.equal(campaignMatches(included, context({ labels: [] })), false);

  const excluded = campaign({ excludedLabels: ["Redistributable"] });
  assert.equal(
    campaignMatches(excluded, context({ labels: ["redistributable"] })),
    false,
  );
  assert.equal(campaignMatches(excluded, context({ labels: ["Docs"] })), true);
});

test("an excluded label vetoes even an included one", () => {
  const c = campaign({
    includedLabels: ["Docs"],
    excludedLabels: ["Redistributed"],
  });
  assert.equal(
    campaignMatches(c, context({ labels: ["Docs", "Redistributed"] })),
    false,
  );
});

test("label filters do not apply to incentive awards", () => {
  assert.equal(campaignScopeSupportsLabels("INCENTIVE"), false);
  assert.equal(campaignScopeSupportsLabels("PPT"), true);

  const c = campaign({ scopes: ["INCENTIVE"], includedLabels: ["Docs"] });
  // No labels to test against, but the campaign still applies.
  assert.equal(
    campaignMatches(c, context({ scope: "INCENTIVE", labels: null })),
    true,
  );
});

// ── Selection ──────────────────────────────────────────────────────────────

test("campaigns never stack — the highest multiplier wins outright", () => {
  const selected = selectCampaign(
    [
      campaign({ id: "a", multiplier: 2 }),
      campaign({ id: "b", multiplier: 3 }),
      campaign({ id: "c", multiplier: 1.5 }),
    ],
    context(),
  );
  assert.equal(selected?.id, "b");
  assert.equal(selected?.multiplier, 3);
});

test("equal multipliers are broken by the most recently created campaign", () => {
  const selected = selectCampaign(
    [
      campaign({ id: "old", createdAt: new Date("2026-07-01T00:00:00.000Z") }),
      campaign({ id: "new", createdAt: new Date("2026-07-20T00:00:00.000Z") }),
    ],
    context(),
  );
  assert.equal(selected?.id, "new");
});

test("selection returns null when nothing applies", () => {
  assert.equal(selectCampaign([], context()), null);
  assert.equal(selectCampaign([campaign({ enabled: false })], context()), null);
  assert.equal(selectCampaign([campaign()], context({ now: END })), null);
});

// ── Multiplier math ────────────────────────────────────────────────────────

test("multiplied amounts stay payable in their currency", () => {
  assert.equal(applyMultiplier(100, 3, "MYR"), 300);
  assert.equal(applyMultiplier(6000, 3, "ROBUX"), 18000);

  // A 1.5x campaign on an odd Robux base must not produce a fraction.
  assert.equal(applyMultiplier(1200 * 5, 1.5, "ROBUX"), 9000);
  assert.equal(Number.isInteger(applyMultiplier(1500, 1.5, "ROBUX")), true);
  assert.equal(applyMultiplier(1, 1.5, "ROBUX"), 2);

  // MYR keeps two decimals, never more.
  assert.equal(applyMultiplier(33.33, 1.5, "MYR"), 50);
  assert.equal(applyMultiplier(20, 1.25, "MYR"), 25);
});

test("a multiplier of 1 or less is a no-op, never a reduction", () => {
  assert.equal(applyMultiplier(100, 1, "MYR"), 100);
  assert.equal(applyMultiplier(100, 0, "MYR"), 100);
  assert.equal(applyMultiplier(100, -3, "MYR"), 100);
  assert.equal(applyMultiplier(100, Number.NaN, "MYR"), 100);
});

test("uplift is the extra money only", () => {
  assert.equal(computeUplift(100, 3, "MYR"), 200);
  assert.equal(computeUplift(1200, 2, "ROBUX"), 1200);
  assert.equal(computeUplift(100, 1, "MYR"), 0);
});

// ── Guardrails ─────────────────────────────────────────────────────────────

const GUARDRAILS = {
  upliftPoolMyr: 500,
  upliftPoolRobux: 0,
  perUserUpliftCapMyr: 200,
  perUserUpliftCapRobux: 0,
};

test("guardrails pass when there is room", () => {
  assert.equal(
    checkCampaignGuardrails({
      guardrails: GUARDRAILS,
      currency: "MYR",
      upliftAmount: 40,
      poolSpent: 100,
      userSpent: 20,
    }),
    null,
  );
});

test("an exhausted pool falls back rather than paying a partial multiplier", () => {
  assert.equal(
    checkCampaignGuardrails({
      guardrails: GUARDRAILS,
      currency: "MYR",
      upliftAmount: 40,
      poolSpent: 480,
      userSpent: 0,
    }),
    "pool_exhausted",
  );
});

test("the per-user cap is checked independently of the pool", () => {
  assert.equal(
    checkCampaignGuardrails({
      guardrails: GUARDRAILS,
      currency: "MYR",
      upliftAmount: 40,
      poolSpent: 0,
      userSpent: 180,
    }),
    "user_cap_reached",
  );
});

test("a zero pool or cap means unlimited", () => {
  assert.equal(
    checkCampaignGuardrails({
      guardrails: GUARDRAILS,
      currency: "ROBUX",
      upliftAmount: 999_999,
      poolSpent: 999_999,
      userSpent: 999_999,
    }),
    null,
  );
});

test("spending exactly the pool is allowed; one unit past is not", () => {
  const base = {
    guardrails: GUARDRAILS,
    currency: "MYR" as const,
    poolSpent: 460,
    userSpent: 0,
  };
  assert.equal(checkCampaignGuardrails({ ...base, upliftAmount: 40 }), null);
  assert.equal(
    checkCampaignGuardrails({ ...base, upliftAmount: 40.01 }),
    "pool_exhausted",
  );
});

// ── Copy ───────────────────────────────────────────────────────────────────

test("multipliers render without trailing zeros", () => {
  assert.equal(formatMultiplier(3), "3x");
  assert.equal(formatMultiplier(2), "2x");
  assert.equal(formatMultiplier(1.5), "1.5x");
  assert.equal(formatMultiplier(1.25), "1.25x");
});

test("the breakdown line shows base, multiplier, and result", () => {
  assert.equal(
    campaignAmountBreakdown({
      baseAmount: 20,
      multiplier: 3,
      finalAmount: 60,
      currency: "MYR",
      campaignName: "Raya Sprint",
    }),
    "RM20.00 x 3x (Raya Sprint) = RM60.00",
  );
});

test("remaining time reads naturally at every scale", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  assert.equal(
    describeCampaignRemaining(new Date("2026-08-15T12:30:00.000Z"), now),
    "ends in 30 minutes",
  );
  assert.equal(
    describeCampaignRemaining(new Date("2026-08-15T13:01:00.000Z"), now),
    "ends in 1 hour",
  );
  assert.equal(
    describeCampaignRemaining(new Date("2026-08-20T12:00:00.000Z"), now),
    "ends in 5 days",
  );
  assert.equal(
    describeCampaignRemaining(new Date("2026-08-15T11:00:00.000Z"), now),
    "ending now",
  );
});
