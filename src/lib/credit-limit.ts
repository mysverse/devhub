import type { Prisma } from "@prisma/client";
import type { CurrencyCode } from "./currency";
import { WEEKLY_CREDIT_LIMITS } from "./payout-policy";
import prisma from "./prisma";

// The limit values live in payout-policy.ts (the client-safe single source of
// truth for explained numbers); re-exported here for existing importers.
export { WEEKLY_CREDIT_LIMITS } from "./payout-policy";

// The weekly limit is measured in BASE amounts — what a payout would have been
// at the normal 1x rate — never the campaign-multiplied `amount`.
//
// The limits are one level-5 task per week (RM100, 6,000 Robux). Counting
// multiplied amounts would mean a single task under a 2x campaign blows the
// whole week's limit, dropping every promo payout out of auto-approval and
// mailing every developer "you're past your weekly limit" for doing exactly
// what the promo asked. The campaign uplift pool is what caps promo spend; this
// limit caps ordinary work volume, and a promo must not move it.
//
// Rows written before the campaign migration have baseAmount backfilled to
// amount, but the null branch stays so a future write path that forgets
// baseAmount under-reports nothing: an under-count here would auto-approve
// payouts that should have gone to an admin.

function weeklyUsageWhere(
  base: Prisma.TransactionWhereInput,
): [Prisma.TransactionWhereInput, Prisma.TransactionWhereInput] {
  return [
    { ...base, baseAmount: { not: null } },
    { ...base, baseAmount: null },
  ];
}

/**
 * Returns the start (Monday 00:00:00 UTC) and end (Sunday 23:59:59.999 UTC)
 * of the current ISO week.
 */
export function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Get a user's total usage for the current ISO week in a given currency.
 * Counts both PENDING and PAID transactions (both consume the limit).
 */
export async function getUserWeeklyUsage(
  userId: string,
  currency: CurrencyCode,
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
  const { weekStart, weekEnd } = getWeekBounds();

  const [withBase, withoutBase] = weeklyUsageWhere({
    userId,
    currency,
    source: "PPT",
    status: { in: ["PENDING", "PAID"] },
    createdAt: { gte: weekStart, lte: weekEnd },
  });

  const [baseRows, legacyRows] = await Promise.all([
    prisma.transaction.aggregate({
      where: withBase,
      _sum: { baseAmount: true },
    }),
    prisma.transaction.aggregate({
      where: withoutBase,
      _sum: { amount: true },
    }),
  ]);

  const used = (baseRows._sum.baseAmount ?? 0) + (legacyRows._sum.amount ?? 0);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function getWeeklyUsageForUsers(
  entries: { userId: string; currency: CurrencyCode }[],
): Promise<Map<string, { used: number; limit: number; remaining: number }>> {
  const uniqueEntries = [
    ...new Map(
      entries.map((entry) => [`${entry.userId}:${entry.currency}`, entry]),
    ).values(),
  ];
  const usageByKey = new Map<
    string,
    { used: number; limit: number; remaining: number }
  >();

  for (const entry of uniqueEntries) {
    const limit = WEEKLY_CREDIT_LIMITS[entry.currency] ?? 0;
    usageByKey.set(`${entry.userId}:${entry.currency}`, {
      used: 0,
      limit,
      remaining: Math.max(0, limit),
    });
  }

  if (uniqueEntries.length === 0) return usageByKey;

  const { weekStart, weekEnd } = getWeekBounds();
  const [withBase, withoutBase] = weeklyUsageWhere({
    userId: { in: uniqueEntries.map((entry) => entry.userId) },
    currency: { in: uniqueEntries.map((entry) => entry.currency) },
    source: "PPT",
    status: { in: ["PENDING", "PAID"] },
    createdAt: { gte: weekStart, lte: weekEnd },
  });

  const [baseRows, legacyRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["userId", "currency"],
      where: withBase,
      _sum: { baseAmount: true },
    }),
    prisma.transaction.groupBy({
      by: ["userId", "currency"],
      where: withoutBase,
      _sum: { amount: true },
    }),
  ]);

  const usedByKey = new Map<string, number>();
  for (const row of baseRows) {
    const currency = row.currency === "ROBUX" ? "ROBUX" : "MYR";
    const key = `${row.userId}:${currency}`;
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + (row._sum.baseAmount ?? 0));
  }
  for (const row of legacyRows) {
    const currency = row.currency === "ROBUX" ? "ROBUX" : "MYR";
    const key = `${row.userId}:${currency}`;
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + (row._sum.amount ?? 0));
  }

  for (const [key, used] of usedByKey) {
    const currency: CurrencyCode = key.endsWith(":ROBUX") ? "ROBUX" : "MYR";
    const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
    usageByKey.set(key, { used, limit, remaining: Math.max(0, limit - used) });
  }

  return usageByKey;
}

/**
 * Check if a new payout would stay within the weekly credit limit.
 * Returns false if the currency has no limit (limit = 0).
 *
 * `newAmount` must be the BASE amount, before any campaign multiplier — see
 * the note at the top of this file.
 */
export async function isWithinCreditLimit(
  userId: string,
  currency: CurrencyCode,
  newAmount: number,
): Promise<boolean> {
  const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
  if (limit <= 0) return false;

  const { used } = await getUserWeeklyUsage(userId, currency);
  return used + newAmount <= limit;
}
