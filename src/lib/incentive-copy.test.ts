import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIncentiveNextTargets,
  incentiveHeldDeveloperCopy,
  incentiveStatusCopy,
} from "./incentive-copy";

function targets(currentStreakWeeks: number) {
  return buildIncentiveNextTargets({
    currency: "MYR",
    completedThisWeek: 0,
    weekly: { enabled: false, nextThreshold: null, nextAmount: null },
    streak: {
      enabled: true,
      thresholdWeeks: 4,
      currentStreakWeeks,
      amount: 50,
    },
    milestone: {
      enabled: false,
      nextCount: null,
      amount: null,
      lifetimeCompleted: 0,
    },
  });
}

test("the streak target counts down from the weeks already banked", () => {
  // Two qualifying weeks in a row, four needed. The card used to say four,
  // because the streak it was handed had been reset by the in-progress week.
  assert.equal(
    targets(2)[0].label,
    "Hit your weekly target 2 more weeks for RM50.00",
  );
  assert.equal(targets(2)[0].remaining, 2);
});

test("the last week before the bonus is singular", () => {
  assert.equal(
    targets(3)[0].label,
    "Hit your weekly target 1 more week for RM50.00",
  );
});

test("a fresh streak asks for the full run", () => {
  assert.equal(targets(0)[0].remaining, 4);
  // And the cycle restarts cleanly after the bonus is earned.
  assert.equal(targets(4)[0].remaining, 4);
});

test("a hold is described to the developer without naming a cap", () => {
  const capped = incentiveHeldDeveloperCopy("over_weekly_cap");
  assert.equal(capped.owner, "admin");
  assert.doesNotMatch(capped.headline, /cap|budget|anomaly/i);

  const invalidated = incentiveHeldDeveloperCopy("issue_invalidated");
  assert.equal(invalidated.owner, "developer");
});

test("every award status still has a label and a colour to render", () => {
  for (const status of [
    "PENDING",
    "HELD",
    "RELEASING",
    "TRANSACTION_PENDING",
    "PAID",
    "CANCELLED",
    "CLAWBACK_REQUESTED",
    "SETTLED_BY_CLAWBACK",
    "SOMETHING_NEW",
  ]) {
    const copy = incentiveStatusCopy(status);
    assert.ok(copy.label.length > 0, status);
    assert.ok(copy.color.length > 0, status);
  }
});
