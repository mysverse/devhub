import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatWeekChip,
  formatWeekLabel,
  formatWeekRange,
  getJustClosedWeekKey,
  getWeekBoundsFor,
  getWeekKey,
  isWeeklyPeriod,
  recentWeekKeys,
  shiftWeekKey,
} from "./incentive-period";

test("a week key names the ISO week its date falls in", () => {
  // 2026-W35 runs Mon 24 Aug to Sun 30 Aug.
  assert.equal(getWeekKey(new Date("2026-08-24T00:00:00.000Z")), "2026-W35");
  assert.equal(getWeekKey(new Date("2026-08-30T23:59:59.999Z")), "2026-W35");
  assert.equal(getWeekKey(new Date("2026-08-23T12:00:00.000Z")), "2026-W34");
});

test("week bounds are Monday 00:00 to Sunday 23:59:59.999 UTC", () => {
  const { weekStart, weekEnd } = getWeekBoundsFor("2026-W35");
  assert.equal(weekStart.toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(weekEnd.toISOString(), "2026-08-30T23:59:59.999Z");
});

test("week keys survive the ISO year boundary", () => {
  // ISO week 1 of 2026 starts on Mon 29 Dec 2025.
  assert.equal(getWeekKey(new Date("2025-12-29T00:00:00.000Z")), "2026-W01");
  assert.equal(getWeekKey(new Date("2026-01-01T00:00:00.000Z")), "2026-W01");
  assert.equal(
    getWeekBoundsFor("2026-W01").weekStart.toISOString(),
    "2025-12-29T00:00:00.000Z",
  );
  // 2020 is a 53-week ISO year; 1 Jan 2021 belongs to its last week.
  assert.equal(getWeekKey(new Date("2021-01-01T00:00:00.000Z")), "2020-W53");
});

test("shifting a week key crosses years without arithmetic drift", () => {
  assert.equal(shiftWeekKey("2026-W01", -1), "2025-W52");
  assert.equal(shiftWeekKey("2025-W52", 1), "2026-W01");
  assert.equal(shiftWeekKey("2026-W35", -2), "2026-W33");
});

test("the just-closed week is the one the Monday cron evaluates", () => {
  // Tue 25 Aug 2026 sits in W35, so the closed week is W34.
  assert.equal(
    getJustClosedWeekKey(new Date("2026-08-25T09:00:00.000Z")),
    "2026-W34",
  );
  // The first minute of a week still looks back at the week before it.
  assert.equal(
    getJustClosedWeekKey(new Date("2026-08-24T00:00:00.000Z")),
    "2026-W34",
  );
});

test("recentWeekKeys returns an inclusive run, oldest first", () => {
  assert.deepEqual(recentWeekKeys("2026-W35", 3), [
    "2026-W33",
    "2026-W34",
    "2026-W35",
  ]);
  assert.deepEqual(recentWeekKeys("2026-W35", 1), ["2026-W35"]);
});

test("week labels read as dates, not as keys", () => {
  assert.equal(formatWeekLabel("2026-W34"), "Week of Aug 17");
  assert.equal(formatWeekRange("2026-W34"), "Aug 17–23");
  assert.equal(formatWeekChip("2026-W34"), "W34");
});

test("a week that straddles two months names both", () => {
  // 2026-W36: Mon 31 Aug to Sun 6 Sep.
  assert.equal(formatWeekRange("2026-W36"), "Aug 31 – Sep 6");
});

test("non-weekly periods are passed through untouched", () => {
  assert.equal(isWeeklyPeriod("2026-W34"), true);
  assert.equal(isWeeklyPeriod("lifetime:25"), false);
  assert.equal(formatWeekLabel("lifetime:25"), "lifetime:25");
  assert.equal(formatWeekRange("lifetime:25"), "lifetime:25");
});
