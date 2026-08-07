import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessDays,
  calculateTargetDate,
  getBaseLeadBusinessDays,
  isWeekendUtc,
  parseOrRollDate,
} from "./assistant-scheduler";

describe("assistant-scheduler", () => {
  it("computes base lead business days by complexity level 1-5", () => {
    assert.equal(getBaseLeadBusinessDays(1), 3);
    assert.equal(getBaseLeadBusinessDays(2), 5);
    assert.equal(getBaseLeadBusinessDays(3), 10);
    assert.equal(getBaseLeadBusinessDays(4), 15);
    assert.equal(getBaseLeadBusinessDays(5), 20);
  });

  it("skips weekends when adding business days", () => {
    // Friday Aug 7, 2026
    const friday = new Date("2026-08-07T00:00:00Z");
    assert.equal(isWeekendUtc(friday), false);

    // 1 business day from Friday should be Monday Aug 10, 2026
    const monday = addBusinessDays(friday, 1);
    assert.equal(monday.toISOString().slice(0, 10), "2026-08-10");

    // 3 business days from Friday should be Wednesday Aug 12, 2026
    const wednesday = addBusinessDays(friday, 3);
    assert.equal(wednesday.toISOString().slice(0, 10), "2026-08-12");
  });

  it("calculates target date with active task workload adjustments capped at +10 days", () => {
    const monday = new Date("2026-08-10T00:00:00Z");

    // 1 active task -> +2 days -> 10 + 2 = 12 business days
    const result1 = calculateTargetDate({
      complexity: 3,
      activeTasks: [{ dueDate: null }],
      referenceDate: monday,
    });
    assert.equal(result1.baseLeadDays, 10);
    assert.equal(result1.workloadDays, 2);
    assert.equal(result1.totalLeadDays, 12);
    assert.equal(result1.isFallback, false);

    // 6 active tasks -> +10 days cap -> 10 + 10 = 20 business days
    const result6 = calculateTargetDate({
      complexity: 3,
      activeTasks: [
        { dueDate: null },
        { dueDate: null },
        { dueDate: null },
        { dueDate: null },
        { dueDate: null },
        { dueDate: null },
      ],
      referenceDate: monday,
    });
    assert.equal(result6.workloadDays, 10);
    assert.equal(result6.totalLeadDays, 20);
  });

  it("applies deadline floor if active task has later deadline within 30 days", () => {
    const monday = new Date("2026-08-10T00:00:00Z");
    // Active task deadline on Aug 14 (Friday)
    const activeDeadline = "2026-08-14";

    const result = calculateTargetDate({
      complexity: 1, // 3 business days
      activeTasks: [{ dueDate: activeDeadline }],
      referenceDate: monday,
    });

    // Floor is Aug 14. 3 + 2 = 5 business days from Aug 14 (Fri):
    // Mon 17, Tue 18, Wed 19, Thu 20, Fri 21
    assert.equal(result.dateString, "2026-08-21");
  });

  it("falls back to base lead time when active tasks data is null", () => {
    const monday = new Date("2026-08-10T00:00:00Z");
    const result = calculateTargetDate({
      complexity: 2, // 5 business days
      activeTasks: null,
      referenceDate: monday,
    });
    assert.equal(result.isFallback, true);
    assert.equal(result.totalLeadDays, 5);
    // 5 business days from Mon Aug 10 = Mon Aug 17
    assert.equal(result.dateString, "2026-08-17");
  });

  it("rolls month/day without a year to next future occurrence", () => {
    const ref = new Date("2026-08-07T00:00:00Z");

    // Aug 5 (past in 2026) -> rolls to 2027-08-05
    const pastNoYear = parseOrRollDate("August 5", ref);
    assert.equal(pastNoYear.requiresCorrection, false);
    assert.equal(pastNoYear.dateString, "2027-08-05");

    // Aug 30 (future in 2026) -> remains 2026-08-30
    const futureNoYear = parseOrRollDate("August 30", ref);
    assert.equal(futureNoYear.requiresCorrection, false);
    assert.equal(futureNoYear.dateString, "2026-08-30");

    // Explicit past year -> requires correction
    const explicitPast = parseOrRollDate("2025-08-30", ref);
    assert.equal(explicitPast.requiresCorrection, true);
  });
});
