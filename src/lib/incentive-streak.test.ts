import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStreakStrip,
  computeStreak,
  type WeekQualification,
} from "./incentive-streak";

const THRESHOLD = 5;

/** Weeks oldest-first, given as counts ending at 2026-W35 (the current week). */
function history(...counts: number[]): WeekQualification[] {
  const keys = [
    "2026-W31",
    "2026-W32",
    "2026-W33",
    "2026-W34",
    "2026-W35",
  ].slice(-counts.length);
  return keys.map((weekKey, index) => ({ weekKey, count: counts[index] }));
}

function streak(...counts: number[]) {
  return computeStreak({
    history: history(...counts),
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
  });
}

test("a week still in progress neither extends nor breaks the streak", () => {
  // The reported bug: two qualifying weeks, nothing done yet this week.
  const result = streak(0, 0, 5, 5, 0);
  assert.equal(result.closedWeeks, 2);
  assert.equal(result.includesCurrentWeek, false);
  assert.equal(result.streakWeeks, 2);
});

test("the current week counts once it has cleared the threshold", () => {
  const result = streak(0, 0, 5, 5, 5);
  assert.equal(result.closedWeeks, 2);
  assert.equal(result.includesCurrentWeek, true);
  assert.equal(result.streakWeeks, 3);
});

test("a missed week breaks the streak", () => {
  assert.equal(streak(5, 0, 5, 5, 0).streakWeeks, 2);
  assert.equal(streak(5, 5, 5, 0, 0).streakWeeks, 0);
});

test("partial progress in a closed week does not count", () => {
  assert.equal(streak(5, 5, 5, 4, 0).streakWeeks, 0);
});

test("no history is a zero streak, not an unfinished walk", () => {
  const result = computeStreak({
    history: [],
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
  });
  assert.equal(result.streakWeeks, 0);
  assert.equal(result.exhausted, false);
});

test("a streak still running at the edge of the window reports exhausted", () => {
  // Every week we were given qualified, so the real streak may be longer.
  const result = streak(5, 5, 5, 5, 0);
  assert.equal(result.closedWeeks, 4);
  assert.equal(result.exhausted, true);

  // A break inside the window means the answer is final.
  assert.equal(streak(0, 5, 5, 5, 0).exhausted, false);
});

test("the current week alone never reports exhausted", () => {
  const result = computeStreak({
    history: [{ weekKey: "2026-W35", count: 5 }],
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
  });
  assert.equal(result.streakWeeks, 1);
  assert.equal(result.exhausted, false);
});

test("the strip shows which weeks counted, and marks the one in progress", () => {
  const chips = buildStreakStrip({
    history: history(5, 0, 5, 5, 2),
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
    weeks: 5,
  });
  assert.deepEqual(
    chips.map((chip) => [chip.label, chip.state]),
    [
      ["W31", "met"],
      ["W32", "missed"],
      ["W33", "met"],
      ["W34", "met"],
      ["W35", "current"],
    ],
  );
});

test("the current chip flips to current-met once the target is hit", () => {
  const chips = buildStreakStrip({
    history: history(5, 5),
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
    weeks: 2,
  });
  assert.equal(chips.at(-1)?.state, "current-met");
});

test("the strip skips weeks it has no data for rather than inventing misses", () => {
  const chips = buildStreakStrip({
    history: history(5, 5),
    threshold: THRESHOLD,
    currentWeekKey: "2026-W35",
    weeks: 5,
  });
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["W34", "W35"],
  );
});
