import { type CurrencyCode, roundAmount } from "@/lib/currency";
import {
  getMonthBounds,
  getMonthKey,
  getWeekBoundsFor,
  getWeekKey,
} from "@/lib/incentive-period";

/**
 * Which incentive awards a cap or budget allows to be paid, and which it holds.
 *
 * Pure on purpose: the engine does the reading and the writing, this decides.
 * Two things were wrong with the arithmetic it replaces.
 *
 * The bucket was derived from the wrong instant. Usage was aggregated over
 * `createdAt`, but an award for week W is written in week W+1, so the per-user
 * weekly cap compared each award against the previous week's spend and never
 * against its own siblings. Awards are now charged to `accountedAt` — see
 * `awardAccountingInstant`.
 *
 * And a release group was charged to a single bucket. `releaseAwardGroup` took
 * every due award for a developer, summed them, and tested the total against
 * the cap for whichever week the cron happened to run in — so two weeks of
 * awards released together could breach a weekly cap that neither week came
 * close to on its own, and one breach held the whole group.
 */

export type IncentiveGuardrailReason =
  | "over_weekly_cap"
  | "over_monthly_cap"
  | "over_weekly_budget"
  | "over_monthly_budget";

export type GuardrailAward = {
  id: string;
  amount: number;
  /** `IncentiveAward.accountedAt` — decides which week and month it charges. */
  accountedAt: Date;
  /**
   * An admin already cleared this award past a hold. Approval waives the check
   * on this award; it never waives the accounting of it, so the amount still
   * fills its buckets for everything evaluated alongside it. Excluding it would
   * quietly redefine the cap as "the cap, plus whatever was approved", and let
   * a later, unreviewed award slip in under an artificially low total.
   */
  approved: boolean;
};

export type GuardrailBuckets = { week: string; month: string };

export type GuardrailWindow = { key: string; start: Date; end: Date };

export type GuardrailWindows = {
  weeks: GuardrailWindow[];
  months: GuardrailWindow[];
};

export type GuardrailLimits = {
  userWeeklyCap: number;
  userMonthlyCap: number;
  programWeeklyBudget: number;
  programMonthlyBudget: number;
};

/**
 * Spend already committed per bucket, EXCLUDING the awards being evaluated.
 * A missing key is zero. Open clawback debt is folded into the user buckets by
 * the caller that wants it counted.
 */
export type GuardrailUsage = {
  userWeekly: Record<string, number>;
  userMonthly: Record<string, number>;
  programWeekly: Record<string, number>;
  programMonthly: Record<string, number>;
};

export type GuardrailHold = {
  award: GuardrailAward;
  reason: IncentiveGuardrailReason;
  /** The bucket that was full: an ISO week key or a "2026-08" month key. */
  bucket: string;
  /** Spend already in that bucket when this award was tested. */
  used: number;
  /** The cap or budget it ran into. */
  limit: number;
};

export type GuardrailDecision = {
  release: GuardrailAward[];
  hold: GuardrailHold[];
};

/** The week and month keys an award's spend is charged to. */
export function bucketsFor(accountedAt: Date): GuardrailBuckets {
  return { week: getWeekKey(accountedAt), month: getMonthKey(accountedAt) };
}

/**
 * The distinct windows the caller has to aggregate, deduped — this is what
 * bounds the engine's query fan-out for a group spanning several weeks.
 */
export function collectBucketWindows(
  awards: GuardrailAward[],
): GuardrailWindows {
  const weeks = new Map<string, GuardrailWindow>();
  const months = new Map<string, GuardrailWindow>();

  for (const award of awards) {
    const { week, month } = bucketsFor(award.accountedAt);
    if (!weeks.has(week)) {
      const { weekStart, weekEnd } = getWeekBoundsFor(week);
      weeks.set(week, { key: week, start: weekStart, end: weekEnd });
    }
    if (!months.has(month)) {
      const { monthStart, monthEnd } = getMonthBounds(award.accountedAt);
      months.set(month, { key: month, start: monthStart, end: monthEnd });
    }
  }

  return { weeks: [...weeks.values()], months: [...months.values()] };
}

function readBucket(usage: Record<string, number>, key: string) {
  return usage[key] ?? 0;
}

/**
 * Decide each award against its own buckets.
 *
 * Awards are considered oldest-period first, then smallest amount first: a
 * deterministic order (so the same group always yields the same answer), and
 * one that pays out as many awards as the headroom allows. A breaching award
 * does not consume headroom, so a smaller award behind it can still fit.
 */
export function evaluateIncentiveGuardrails({
  awards,
  limits,
  usage,
  currency,
}: {
  awards: GuardrailAward[];
  limits: GuardrailLimits;
  usage: GuardrailUsage;
  currency: CurrencyCode;
}): GuardrailDecision {
  const userWeekly = { ...usage.userWeekly };
  const userMonthly = { ...usage.userMonthly };
  const programWeekly = { ...usage.programWeekly };
  const programMonthly = { ...usage.programMonthly };

  const release: GuardrailAward[] = [];
  const hold: GuardrailHold[] = [];

  const charge = (award: GuardrailAward) => {
    const { week, month } = bucketsFor(award.accountedAt);
    userWeekly[week] = roundAmount(
      readBucket(userWeekly, week) + award.amount,
      currency,
    );
    userMonthly[month] = roundAmount(
      readBucket(userMonthly, month) + award.amount,
      currency,
    );
    programWeekly[week] = roundAmount(
      readBucket(programWeekly, week) + award.amount,
      currency,
    );
    programMonthly[month] = roundAmount(
      readBucket(programMonthly, month) + award.amount,
      currency,
    );
  };

  // Approved awards are settled first so their spend is visible to every other
  // award's check. Once a human has authorised going over a bucket, everything
  // else charging that bucket is held for a fresh decision rather than waved
  // through on headroom that no longer exists.
  for (const award of awards.filter((item) => item.approved)) {
    charge(award);
    release.push(award);
  }

  const pending = awards
    .filter((award) => !award.approved)
    .sort(
      (a, b) =>
        a.accountedAt.getTime() - b.accountedAt.getTime() ||
        a.amount - b.amount ||
        a.id.localeCompare(b.id),
    );

  for (const award of pending) {
    const { week, month } = bucketsFor(award.accountedAt);
    const breach = firstBreach({
      amount: award.amount,
      currency,
      limits,
      buckets: { week, month },
      totals: {
        userWeekly: readBucket(userWeekly, week),
        userMonthly: readBucket(userMonthly, month),
        programWeekly: readBucket(programWeekly, week),
        programMonthly: readBucket(programMonthly, month),
      },
    });

    if (breach) {
      // Recorded with the arithmetic that produced it, so the admin card can
      // show why rather than asking anyone to trust the word "cap". The totals
      // are the ones at the moment this award was tested, siblings included.
      hold.push({ award, ...breach });
      continue;
    }
    charge(award);
    release.push(award);
  }

  return { release, hold };
}

/**
 * Reason precedence is per-user caps before program budgets, weekly before
 * monthly — the order the engine has always reported, kept so an award that
 * breaches several is still explained by the same one.
 */
function firstBreach({
  amount,
  currency,
  limits,
  buckets,
  totals,
}: {
  amount: number;
  currency: CurrencyCode;
  limits: GuardrailLimits;
  buckets: GuardrailBuckets;
  totals: {
    userWeekly: number;
    userMonthly: number;
    programWeekly: number;
    programMonthly: number;
  };
}): Omit<GuardrailHold, "award"> | null {
  const checks: {
    reason: IncentiveGuardrailReason;
    bucket: string;
    used: number;
    limit: number;
  }[] = [
    {
      reason: "over_weekly_cap",
      bucket: buckets.week,
      used: totals.userWeekly,
      limit: limits.userWeeklyCap,
    },
    {
      reason: "over_monthly_cap",
      bucket: buckets.month,
      used: totals.userMonthly,
      limit: limits.userMonthlyCap,
    },
    {
      reason: "over_weekly_budget",
      bucket: buckets.week,
      used: totals.programWeekly,
      limit: limits.programWeeklyBudget,
    },
    {
      reason: "over_monthly_budget",
      bucket: buckets.month,
      used: totals.programMonthly,
      limit: limits.programMonthlyBudget,
    },
  ];

  // A limit of zero (or less) is disabled, matching the engine's long-standing
  // `cap > 0 &&` reading.
  return (
    checks.find(
      (check) =>
        check.limit > 0 &&
        roundAmount(check.used + amount, currency) > check.limit,
    ) ?? null
  );
}
