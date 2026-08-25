import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatAbsoluteUtc,
  formatRemaining,
  formatTimeUntil,
} from "./relative-time";

test("remaining time gets coarser as it gets further away", () => {
  assert.equal(formatRemaining(42 * 60_000), "42m");
  assert.equal(formatRemaining(5 * 3_600_000 + 12 * 60_000), "5h 12m");
  assert.equal(formatRemaining(3 * 86_400_000 + 4 * 3_600_000), "3d 4h");
});

test("a countdown that has run out says so without pretending to be precise", () => {
  assert.equal(formatRemaining(0), "now");
  assert.equal(formatRemaining(-5_000), "now");
  assert.equal(
    formatTimeUntil(
      new Date("2026-08-25T00:00:00.000Z"),
      new Date("2026-08-25T00:10:00.000Z"),
    ),
    // The release cron runs hourly, so "now" would be a promise we cannot keep.
    "any moment now",
  );
});

test("a future instant reads as a sentence", () => {
  assert.equal(
    formatTimeUntil(
      new Date("2026-08-26T09:00:00.000Z"),
      new Date("2026-08-25T05:00:00.000Z"),
    ),
    "in 1d 4h",
  );
});

test("absolute times are pinned to UTC so both sides render the same string", () => {
  assert.equal(
    formatAbsoluteUtc(new Date("2026-08-26T09:01:53.000Z")),
    "Wed, Aug 26, 9:01 AM UTC",
  );
});
