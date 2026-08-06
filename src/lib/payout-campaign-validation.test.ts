import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CampaignFieldsInput,
  campaignConfigWarnings,
  collectCampaignFieldErrors,
  parseCampaignFields,
} from "./payout-campaign-validation";

function draft(
  overrides: Partial<CampaignFieldsInput> = {},
): CampaignFieldsInput {
  return {
    slug: "raya-sprint",
    name: "Raya Sprint",
    headline: "3x on every PPT task this sprint",
    accentColor: "violet",
    multiplier: 3,
    scopes: ["PPT"],
    enabled: false,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-15T00:00:00.000Z",
    includedLabels: [],
    excludedLabels: [],
    ranks: [],
    participantUserIds: [],
    upliftPoolMyr: 500,
    upliftPoolRobux: 0,
    perUserUpliftCapMyr: 0,
    perUserUpliftCapRobux: 0,
    creditLimitOnBaseAmount: true,
    ...overrides,
  };
}

test("a well-formed campaign parses into Date objects", () => {
  const result = parseCampaignFields(draft());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.fields.startsAt instanceof Date);
  assert.ok(result.fields.endsAt instanceof Date);
  assert.equal(result.fields.multiplier, 3);
});

test("the multiplier must actually pay something extra and stay capped", () => {
  assert.equal(
    collectCampaignFieldErrors(draft({ multiplier: 1 })).multiplier,
    "A multiplier of 1x or less pays nothing extra",
  );
  assert.equal(
    collectCampaignFieldErrors(draft({ multiplier: 0.5 })).multiplier,
    "A multiplier of 1x or less pays nothing extra",
  );
  assert.match(
    collectCampaignFieldErrors(draft({ multiplier: 6 })).multiplier ?? "",
    /capped at 5x/,
  );
  assert.equal(
    collectCampaignFieldErrors(draft({ multiplier: 5 })).multiplier,
    undefined,
  );
});

test("the window must be ordered and bounded", () => {
  assert.equal(
    collectCampaignFieldErrors(
      draft({
        startsAt: "2026-08-15T00:00:00.000Z",
        endsAt: "2026-08-01T00:00:00.000Z",
      }),
    ).endsAt,
    "The end time must be after the start time",
  );

  // Equal timestamps are an empty window, not a zero-length campaign.
  assert.equal(
    collectCampaignFieldErrors(
      draft({
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-01T00:00:00.000Z",
      }),
    ).endsAt,
    "The end time must be after the start time",
  );

  assert.match(
    collectCampaignFieldErrors(
      draft({
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
      }),
    ).endsAt ?? "",
    /at most 90 days/,
  );
});

test("slugs are kebab-case so they can key dismissals and dedupe keys", () => {
  assert.equal(
    collectCampaignFieldErrors(draft({ slug: "raya-sprint-2" })).slug,
    undefined,
  );
  assert.match(
    collectCampaignFieldErrors(draft({ slug: "Raya Sprint" })).slug ?? "",
    /lowercase words joined by hyphens/,
  );
  assert.match(
    collectCampaignFieldErrors(draft({ slug: "raya_sprint" })).slug ?? "",
    /lowercase words joined by hyphens/,
  );
});

test("a campaign must boost at least one payout type", () => {
  assert.equal(
    collectCampaignFieldErrors(draft({ scopes: [] })).scopes,
    "Pick at least one payout type to boost",
  );
});

test("labels and ranks are trimmed and de-duplicated", () => {
  const result = parseCampaignFields(
    draft({
      includedLabels: [" Docs ", "Docs", "", "Infra"],
      ranks: ["SENIOR_DEVELOPER", "SENIOR_DEVELOPER"],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.includedLabels, ["Docs", "Infra"]);
  assert.deepEqual(result.fields.ranks, ["SENIOR_DEVELOPER"]);
});

test("negative pools and caps are rejected", () => {
  assert.match(
    collectCampaignFieldErrors(draft({ upliftPoolMyr: -1 })).upliftPoolMyr ??
      "",
    /cannot be negative/,
  );
  assert.match(
    collectCampaignFieldErrors(draft({ perUserUpliftCapRobux: -1 }))
      .perUserUpliftCapRobux ?? "",
    /cannot be negative/,
  );
});

test("an unparseable date is reported on its own field", () => {
  assert.equal(
    collectCampaignFieldErrors(draft({ startsAt: "not-a-date" })).startsAt,
    "Enter a valid date and time",
  );
});

// ── Non-blocking warnings ──────────────────────────────────────────────────

test("label filters on an incentive-only campaign are called out", () => {
  const warnings = campaignConfigWarnings({
    scopes: ["INCENTIVE"],
    includedLabels: ["Docs"],
    excludedLabels: [],
    upliftPoolMyr: 500,
    upliftPoolRobux: 0,
    multiplier: 2,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Label filters do nothing here/);
});

test("a mixed-scope campaign is told labels only bind PPT and bonus", () => {
  const warnings = campaignConfigWarnings({
    scopes: ["PPT", "INCENTIVE"],
    includedLabels: ["Docs"],
    excludedLabels: [],
    upliftPoolMyr: 500,
    upliftPoolRobux: 0,
    multiplier: 2,
  });
  assert.match(warnings[0], /PPT and bonus amounts only/);
});

test("an uncapped pool is flagged before anyone enables a 3x campaign", () => {
  const warnings = campaignConfigWarnings({
    scopes: ["PPT"],
    includedLabels: [],
    excludedLabels: [],
    upliftPoolMyr: 0,
    upliftPoolRobux: 0,
    multiplier: 3,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /uncapped at 3x/);
});
