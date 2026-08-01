import assert from "node:assert/strict";
import { test } from "node:test";
import { getRateMultiplier } from "./currency";
import {
  DEFAULT_STABILITY_MINUTES,
  DEFAULT_UNASSIGN_HOURS,
  DEFAULT_WARN_HOURS,
} from "./payout-policy";
import { getResolvedPayoutPolicy } from "./payout-policy-server";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map(
    Object.keys(vars).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("resolves defaults when env is unset", () => {
  withEnv(
    {
      PPT_STABILITY_MINUTES: undefined,
      PPT_HOGGING_WARNING_HOURS: undefined,
      PPT_HOGGING_UNASSIGN_HOURS: undefined,
    },
    () => {
      const policy = getResolvedPayoutPolicy();
      assert.equal(policy.stabilityMinutes, DEFAULT_STABILITY_MINUTES);
      assert.equal(policy.warnHours, DEFAULT_WARN_HOURS);
      assert.equal(policy.unassignHours, DEFAULT_UNASSIGN_HOURS);
    },
  );
});

test("env overrides win; stability allows zero", () => {
  withEnv(
    {
      PPT_STABILITY_MINUTES: "0",
      PPT_HOGGING_WARNING_HOURS: "24",
      PPT_HOGGING_UNASSIGN_HOURS: "36",
    },
    () => {
      const policy = getResolvedPayoutPolicy();
      assert.equal(policy.stabilityMinutes, 0);
      assert.equal(policy.warnHours, 24);
      assert.equal(policy.unassignHours, 36);
    },
  );
});

test("garbage env values fall back to defaults", () => {
  withEnv(
    {
      PPT_STABILITY_MINUTES: "banana",
      PPT_HOGGING_WARNING_HOURS: "-4",
    },
    () => {
      const policy = getResolvedPayoutPolicy();
      assert.equal(policy.stabilityMinutes, DEFAULT_STABILITY_MINUTES);
      assert.equal(policy.warnHours, DEFAULT_WARN_HOURS);
    },
  );
});

test("rate multipliers come from the currency config", () => {
  assert.equal(getRateMultiplier("MYR"), 20);
  assert.equal(getRateMultiplier("ROBUX"), 1200);
});
