import assert from "node:assert/strict";
import { test } from "node:test";
import { getAssignmentWatchTiming } from "./ppt-assignment-watch-activity";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-08-01T12:00:00Z");

function timing(overrides: Record<string, unknown>) {
  return getAssignmentWatchTiming({
    lastActivityAt: new Date(now.getTime() - 50 * HOUR),
    status: "ACTIVE",
    snoozedUntil: null,
    selfBlockExpiresAt: null,
    now,
    warningHours: 48,
    unassignHours: 72,
    ...overrides,
  });
}

test("an active self-block pauses the clock", () => {
  const result = timing({
    status: "BLOCKED",
    selfBlockExpiresAt: new Date(now.getTime() + 10 * HOUR),
  });
  assert.equal(result.isBlocked, true);
  assert.equal(result.isPaused, true);
  assert.equal(result.dueWithin24Hours, false);
});

test("an expired self-block no longer pauses", () => {
  const result = timing({
    status: "BLOCKED",
    selfBlockExpiresAt: new Date(now.getTime() - 1 * HOUR),
  });
  assert.equal(result.isBlocked, false);
  assert.equal(result.isPaused, false);
});

test("snooze still pauses like before", () => {
  const result = timing({
    status: "SNOOZED",
    snoozedUntil: new Date(now.getTime() + 5 * HOUR),
  });
  assert.equal(result.isSnoozed, true);
  assert.equal(result.isPaused, true);
});

test("active watches past the warning threshold count as due soon inside 24h", () => {
  const result = timing({});
  assert.equal(result.isPaused, false);
  assert.ok(result.staleHours >= 48);
  assert.equal(result.dueWithin24Hours, true);
});
