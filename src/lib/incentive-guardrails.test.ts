import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketsFor,
  collectBucketWindows,
  evaluateIncentiveGuardrails,
  type GuardrailAward,
  type GuardrailLimits,
  type GuardrailUsage,
} from "./incentive-guardrails";
import { awardAccountingInstant } from "./incentive-period";

const NO_USAGE: GuardrailUsage = {
  userWeekly: {},
  userMonthly: {},
  programWeekly: {},
  programMonthly: {},
};

const NO_LIMITS: GuardrailLimits = {
  userWeeklyCap: 0,
  userMonthlyCap: 0,
  programWeeklyBudget: 0,
  programMonthlyBudget: 0,
};

function award(
  id: string,
  amount: number,
  period: string,
  overrides: Partial<GuardrailAward> = {},
): GuardrailAward {
  return {
    id,
    amount,
    // The award was written the Monday after its week closed, the way the cron
    // does it — the createdAt that used to decide the bucket.
    accountedAt: awardAccountingInstant(
      period,
      new Date("2026-08-24T01:00:00.000Z"),
    ),
    approved: false,
    ...overrides,
  };
}

function decide({
  awards,
  limits = {},
  usage = {},
}: {
  awards: GuardrailAward[];
  limits?: Partial<GuardrailLimits>;
  usage?: Partial<GuardrailUsage>;
}) {
  return evaluateIncentiveGuardrails({
    awards,
    limits: { ...NO_LIMITS, ...limits },
    usage: { ...NO_USAGE, ...usage },
    currency: "MYR",
  });
}

test("an award is charged to its own week, not to the week it was written in", () => {
  // Created Mon 24 Aug (2026-W35) for the week that just closed (2026-W34).
  assert.equal(
    bucketsFor(award("a", 30, "2026-W34").accountedAt).week,
    "2026-W34",
  );
  assert.equal(
    bucketsFor(award("a", 30, "2026-W34").accountedAt).month,
    "2026-08",
  );
});

test("two weeks released together are two buckets, not one", () => {
  // The reported shape: W33 and W34 awards, both due, released in one run.
  const result = decide({
    awards: [
      award("w33-weekly", 30, "2026-W33"),
      award("w33-leaderboard", 40, "2026-W33"),
      award("w34-weekly", 30, "2026-W34"),
      award("w34-leaderboard", 40, "2026-W34"),
    ],
    limits: { userWeeklyCap: 100 },
  });

  // 70 in each week, under a 100 weekly cap. Summed into one bucket it would be
  // 140 and the whole group would have been held.
  assert.equal(result.hold.length, 0);
  assert.equal(result.release.length, 4);
});

test("awards for the same week count toward each other", () => {
  const result = decide({
    awards: [
      award("weekly", 60, "2026-W34"),
      award("leaderboard", 70, "2026-W34"),
    ],
    limits: { userWeeklyCap: 100 },
  });

  assert.deepEqual(
    result.release.map((item) => item.id),
    ["weekly"],
  );
  assert.equal(result.hold.length, 1);
  assert.equal(result.hold[0].reason, "over_weekly_cap");
  assert.equal(result.hold[0].bucket, "2026-W34");
});

test("a monthly cap spans the weeks inside it", () => {
  const result = decide({
    awards: [award("w33", 70, "2026-W33"), award("w34", 70, "2026-W34")],
    limits: { userWeeklyCap: 100, userMonthlyCap: 100 },
  });

  assert.deepEqual(
    result.release.map((item) => item.id),
    ["w33"],
  );
  assert.equal(result.hold[0].reason, "over_monthly_cap");
  assert.equal(result.hold[0].bucket, "2026-08");
});

test("a week that straddles two months charges to the month it ends in", () => {
  // 2026-W31 runs Mon 27 Jul to Sun 2 Aug.
  assert.equal(
    bucketsFor(award("a", 30, "2026-W31").accountedAt).month,
    "2026-08",
  );
});

test("per-user caps are reported before program budgets", () => {
  const result = decide({
    awards: [award("a", 200, "2026-W34")],
    limits: {
      userWeeklyCap: 100,
      userMonthlyCap: 100,
      programWeeklyBudget: 100,
      programMonthlyBudget: 100,
    },
  });
  assert.equal(result.hold[0].reason, "over_weekly_cap");
});

test("a program budget holds an award whose own caps are clear", () => {
  const result = decide({
    awards: [award("a", 30, "2026-W34")],
    limits: { userWeeklyCap: 150, programWeeklyBudget: 100 },
    // Other developers already spent the program's week.
    usage: { programWeekly: { "2026-W34": 90 } },
  });
  assert.equal(result.hold[0].reason, "over_weekly_budget");
  assert.equal(result.hold[0].used, 90);
  assert.equal(result.hold[0].limit, 100);
});

test("a limit of zero is disabled, not a cap of nothing", () => {
  const result = decide({ awards: [award("a", 500, "2026-W34")] });
  assert.equal(result.hold.length, 0);
  assert.equal(result.release.length, 1);
});

test("an approved award is paid however full its bucket is", () => {
  const result = decide({
    awards: [award("a", 500, "2026-W34", { approved: true })],
    limits: { userWeeklyCap: 100, userMonthlyCap: 100 },
    usage: { userWeekly: { "2026-W34": 90 } },
  });
  assert.equal(result.hold.length, 0);
  assert.deepEqual(
    result.release.map((item) => item.id),
    ["a"],
  );
});

test("approval waives the check on that award, not the accounting of it", () => {
  // Once a human authorises going over, the next award charging that bucket is
  // held for a fresh decision rather than waved through on absent headroom.
  const result = decide({
    awards: [
      award("approved", 200, "2026-W34", { approved: true }),
      award("unapproved", 10, "2026-W34"),
    ],
    limits: { userWeeklyCap: 100 },
  });

  assert.deepEqual(
    result.release.map((item) => item.id),
    ["approved"],
  );
  assert.equal(result.hold[0].award.id, "unapproved");
  assert.equal(result.hold[0].used, 200);
});

test("an approved award in another bucket leaves this one alone", () => {
  const result = decide({
    awards: [
      award("approved", 200, "2026-W30", { approved: true }),
      award("unapproved", 10, "2026-W34"),
    ],
    limits: { userWeeklyCap: 100 },
  });
  assert.equal(result.hold.length, 0);
  assert.equal(result.release.length, 2);
});

test("only the breaching award is held; the rest of the group is paid", () => {
  const awards = [
    award("small", 10, "2026-W34"),
    award("huge", 500, "2026-W34"),
    award("medium", 20, "2026-W34"),
  ];
  const result = decide({ awards, limits: { userWeeklyCap: 100 } });

  assert.deepEqual(result.release.map((item) => item.id).sort(), [
    "medium",
    "small",
  ]);
  assert.deepEqual(
    result.hold.map((item) => item.award.id),
    ["huge"],
  );
  // Nothing may be silently dropped: an award missing from both lists would be
  // left stranded in RELEASING by the caller.
  assert.equal(result.release.length + result.hold.length, awards.length);
});

test("a held award does not eat the headroom behind it", () => {
  const result = decide({
    awards: [award("blocker", 200, "2026-W34"), award("fits", 50, "2026-W34")],
    limits: { userWeeklyCap: 100 },
  });
  assert.deepEqual(
    result.release.map((item) => item.id),
    ["fits"],
  );
});

test("the decision does not depend on the order it was handed", () => {
  const awards = [
    award("c", 40, "2026-W34"),
    award("a", 40, "2026-W33"),
    award("b", 90, "2026-W34"),
  ];
  const forward = decide({ awards, limits: { userWeeklyCap: 100 } });
  const reversed = decide({
    awards: [...awards].reverse(),
    limits: { userWeeklyCap: 100 },
  });

  assert.deepEqual(
    forward.release.map((item) => item.id),
    reversed.release.map((item) => item.id),
  );
  assert.deepEqual(
    forward.hold.map((item) => item.award.id),
    reversed.hold.map((item) => item.award.id),
  );
});

test("cents do not accumulate into a phantom breach", () => {
  const result = decide({
    awards: [
      award("a", 33.33, "2026-W34"),
      award("b", 33.33, "2026-W34"),
      award("c", 33.33, "2026-W34"),
    ],
    limits: { userWeeklyCap: 99.99 },
  });
  assert.equal(result.hold.length, 0);
});

test("existing spend in the bucket counts against the cap", () => {
  const result = decide({
    awards: [award("a", 30, "2026-W34")],
    limits: { userWeeklyCap: 100 },
    usage: { userWeekly: { "2026-W34": 80 } },
  });
  assert.equal(result.hold[0].reason, "over_weekly_cap");
  assert.equal(result.hold[0].used, 80);
});

test("the windows to query are deduped per bucket", () => {
  const windows = collectBucketWindows([
    award("a", 10, "2026-W33"),
    award("b", 10, "2026-W34"),
    award("c", 10, "2026-W34"),
  ]);

  assert.deepEqual(
    windows.weeks.map((window) => window.key),
    ["2026-W33", "2026-W34"],
  );
  assert.deepEqual(
    windows.months.map((window) => window.key),
    ["2026-08"],
  );
  assert.equal(
    windows.weeks[1].start.toISOString(),
    "2026-08-17T00:00:00.000Z",
  );
  assert.equal(windows.weeks[1].end.toISOString(), "2026-08-23T23:59:59.999Z");
});

test("nothing in, nothing out", () => {
  const result = decide({ awards: [], limits: { userWeeklyCap: 100 } });
  assert.deepEqual(result.release, []);
  assert.deepEqual(result.hold, []);
});
