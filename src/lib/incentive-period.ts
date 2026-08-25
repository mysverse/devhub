/**
 * Incentive periods — ISO week keys ("2026-W34") and the human labels for them.
 *
 * Split out of `@/lib/incentives` (which imports prisma and is server-only) so
 * client components can name a week without pulling the engine in. Everything
 * here is pure and UTC — the incentive week is Monday to Sunday UTC, and the
 * labels pin `timeZone: "UTC"` so a server render and a client render of the
 * same key produce the same string.
 */

/** ISO-8601 week key for a date, e.g. "2026-W34". */
export function getWeekKey(date: Date): string {
  const working = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((working.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday 00:00:00.000 UTC to Sunday 23:59:59.999 UTC for a week key. */
export function getWeekBoundsFor(weekKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error(`Invalid ISO week key: ${weekKey}`);

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/** The week that closed most recently — what the Monday cron evaluates. */
export function getJustClosedWeekKey(now = new Date()) {
  const currentWeek = getWeekBoundsFor(getWeekKey(now));
  return getWeekKey(new Date(currentWeek.weekStart.getTime() - 1));
}

/** Same week key, shifted by whole weeks (negative goes back). */
export function shiftWeekKey(weekKey: string, weeks: number) {
  const { weekStart } = getWeekBoundsFor(weekKey);
  const shifted = new Date(weekStart);
  shifted.setUTCDate(shifted.getUTCDate() + weeks * 7);
  return getWeekKey(shifted);
}

/** Matches an ISO week key. The award `period` column holds these or "lifetime:N". */
export const WEEK_PERIOD_PATTERN = /^\d{4}-W\d{2}$/;

/** True for a weekly-style award period; false for "lifetime:25" and friends. */
export function isWeeklyPeriod(period: string) {
  return WEEK_PERIOD_PATTERN.test(period);
}

/**
 * The last N week keys ending at (and including) `endingWeekKey`, oldest first.
 */
export function recentWeekKeys(endingWeekKey: string, weeks: number) {
  const keys: string[] = [];
  for (let offset = weeks - 1; offset >= 0; offset--) {
    keys.push(shiftWeekKey(endingWeekKey, -offset));
  }
  return keys;
}

const DAY_MONTH: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
};

/** "Week of Aug 17" — the human name for a week key. */
export function formatWeekLabel(weekKey: string) {
  if (!isWeeklyPeriod(weekKey)) return weekKey;
  const { weekStart } = getWeekBoundsFor(weekKey);
  return `Week of ${weekStart.toLocaleDateString("en-US", DAY_MONTH)}`;
}

/** "Aug 17–23" within a month, "Aug 31 – Sep 6" across one. */
export function formatWeekRange(weekKey: string) {
  if (!isWeeklyPeriod(weekKey)) return weekKey;
  const { weekStart, weekEnd } = getWeekBoundsFor(weekKey);
  const start = weekStart.toLocaleDateString("en-US", DAY_MONTH);
  if (weekStart.getUTCMonth() === weekEnd.getUTCMonth()) {
    return `${start}–${weekEnd.getUTCDate()}`;
  }
  return `${start} – ${weekEnd.toLocaleDateString("en-US", DAY_MONTH)}`;
}

/** "W34" — the compact chip label for a streak strip. */
export function formatWeekChip(weekKey: string) {
  const match = /^\d{4}-W(\d{2})$/.exec(weekKey);
  return match ? `W${match[1]}` : weekKey;
}
