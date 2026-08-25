import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ExplainableAward,
  explainIncentiveAward,
  INCENTIVE_EVENT_COPY,
  INCENTIVE_STEPS,
  stepIndexForStatus,
} from "./incentive-explain";

const NOW = new Date("2026-08-25T00:00:00.000Z");

function award(overrides: Partial<ExplainableAward> = {}): ExplainableAward {
  return {
    status: "PENDING",
    heldReason: null,
    releaseAt: new Date("2026-08-26T09:00:00.000Z"),
    amount: 30,
    currency: "MYR",
    period: "2026-W34",
    ...overrides,
  };
}

test("a held award is the review step, stopped — not a separate status", () => {
  const pending = explainIncentiveAward(award(), NOW);
  const held = explainIncentiveAward(
    award({ status: "HELD", heldReason: "over_weekly_cap", releaseAt: null }),
    NOW,
  );

  assert.equal(pending.stepIndex, held.stepIndex);
  assert.equal(INCENTIVE_STEPS[held.stepIndex].key, "review");
  assert.equal(pending.paused, false);
  assert.equal(held.paused, true);
});

test("a hold explains who is holding it, not the cap the developer cannot see", () => {
  const held = explainIncentiveAward(
    award({ status: "HELD", heldReason: "over_monthly_cap", releaseAt: null }),
    NOW,
  );
  assert.equal(held.owner, "admin");
  assert.equal(held.tone, "warning");
  assert.match(held.headline, /admin is checking/i);
  assert.doesNotMatch(`${held.headline} ${held.detail}`, /cap|budget/i);
});

test("an invalidated issue is the one hold the developer can act on", () => {
  const held = explainIncentiveAward(
    award({ status: "HELD", heldReason: "issue_invalidated", releaseAt: null }),
    NOW,
  );
  assert.equal(held.owner, "developer");
});

test("a pending award waiting on the clock carries the instant to count down to", () => {
  const explanation = explainIncentiveAward(award(), NOW);
  assert.equal(
    explanation.releasesAt?.toISOString(),
    "2026-08-26T09:00:00.000Z",
  );
  assert.equal(explanation.owner, "automatic");
});

test("a pending award whose window has passed is waiting on the run, not the clock", () => {
  const explanation = explainIncentiveAward(
    award({ releaseAt: new Date("2026-08-24T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(explanation.releasesAt, null);
  assert.match(explanation.headline, /ready to send/i);
  assert.match(explanation.detail ?? "", /next payout run/i);
});

test("an award with no release window at all still explains itself", () => {
  const explanation = explainIncentiveAward(award({ releaseAt: null }), NOW);
  assert.equal(explanation.releasesAt, null);
  assert.equal(explanation.tone, "info");
});

test("money on its way reads as money, not as a status name", () => {
  const sending = explainIncentiveAward(
    award({ status: "TRANSACTION_PENDING" }),
    NOW,
  );
  assert.equal(INCENTIVE_STEPS[sending.stepIndex].key, "sending");
  assert.match(sending.headline, /RM30\.00 is on its way/);

  const paid = explainIncentiveAward(award({ status: "PAID" }), NOW);
  assert.equal(INCENTIVE_STEPS[paid.stepIndex].key, "paid");
  assert.equal(paid.tone, "positive");
});

test("journeys that end somewhere other than paid are marked stopped", () => {
  for (const status of [
    "CANCELLED",
    "CLAWBACK_REQUESTED",
    "SETTLED_BY_CLAWBACK",
  ]) {
    const explanation = explainIncentiveAward(award({ status }), NOW);
    assert.equal(explanation.stopped, true, status);
    assert.equal(explanation.stepIndex, -1, status);
  }
  assert.equal(
    explainIncentiveAward(award({ status: "PAID" }), NOW).stopped,
    false,
  );
});

test("an unknown status degrades instead of throwing", () => {
  const explanation = explainIncentiveAward(
    award({ status: "SOMETHING_NEW" }),
    NOW,
  );
  assert.equal(explanation.stepIndex, -1);
  assert.equal(explanation.headline, "In progress");
  assert.equal(stepIndexForStatus("SOMETHING_NEW"), -1);
});

test("the event trail whitelist keeps admin-facing events out", () => {
  // These carry hold reasons, cap arithmetic and admin notes.
  for (const internal of [
    "EVALUATED",
    "ADMIN_ALERT_SENT",
    "STALE_LINEAR_WEBHOOK",
    "ACTIVATED",
  ]) {
    assert.equal(INCENTIVE_EVENT_COPY[internal], undefined, internal);
  }
  assert.equal(INCENTIVE_EVENT_COPY.HELD_APPROVED, "Cleared by an admin");
});
