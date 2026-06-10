import type { CurrencyCode } from "./currency";
import prisma from "./prisma";

/**
 * Weekly credit limits per currency.
 * Transactions within these limits are auto-approved.
 * Set to 0 to disable auto-approval for a currency.
 */
export const WEEKLY_CREDIT_LIMITS: Record<CurrencyCode, number> = {
  MYR: 100,
  ROBUX: 6000, // ~5 estimate points at 1,200 Robux each
};

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

  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      currency,
      source: "PPT",
      status: { in: ["PENDING", "PAID"] },
      createdAt: { gte: weekStart, lte: weekEnd },
    },
    _sum: { amount: true },
  });

  const used = result._sum.amount ?? 0;
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
  const rows = await prisma.transaction.groupBy({
    by: ["userId", "currency"],
    where: {
      userId: { in: uniqueEntries.map((entry) => entry.userId) },
      currency: { in: uniqueEntries.map((entry) => entry.currency) },
      source: "PPT",
      status: { in: ["PENDING", "PAID"] },
      createdAt: { gte: weekStart, lte: weekEnd },
    },
    _sum: { amount: true },
  });

  for (const row of rows) {
    const currency = row.currency === "ROBUX" ? "ROBUX" : "MYR";
    const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
    const used = row._sum.amount ?? 0;
    usageByKey.set(`${row.userId}:${currency}`, {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    });
  }

  return usageByKey;
}

/**
 * Check if a new transaction amount would stay within the weekly credit limit.
 * Returns false if the currency has no limit (limit = 0).
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
