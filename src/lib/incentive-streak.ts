import { formatWeekChip, shiftWeekKey } from "@/lib/incentive-period";

/**
 * Streak arithmetic, kept pure and away from the engine's IO.
 *
 * The rule the product promises is "hit your weekly target N weeks in a row",
 * and a week only counts once it has closed and been evaluated. The week you
 * are standing in is therefore neither a hit nor a miss — it is in progress.
 * Counting it as a miss is what made the dashboard read "0 weeks" every Monday
 * for developers who had just strung two weeks together.
 */

export type WeekQualification = {
  weekKey: string;
  /** Qualifying completions counted in that week. */
  count: number;
};

export type StreakResult = {
  /** Consecutive closed weeks at or above threshold, ending last week. */
  closedWeeks: number;
  /** The in-progress week has already cleared the threshold. */
  includesCurrentWeek: boolean;
  /** What the developer is told: closed weeks plus the current one if earned. */
  streakWeeks: number;
  /**
   * The walk reached the oldest week it was given while still qualifying, so
   * the real streak may be longer. Callers with more history to offer should
   * extend the window and ask again.
   */
  exhausted: boolean;
};

export function countsByWeek(history: WeekQualification[]) {
  return new Map(history.map((week) => [week.weekKey, week.count]));
}

export function computeStreak({
  history,
  threshold,
  currentWeekKey,
}: {
  /** Every week in the window, including the ones with a zero count. */
  history: WeekQualification[];
  threshold: number;
  currentWeekKey: string;
}): StreakResult {
  const counts = countsByWeek(history);
  const met = (weekKey: string) => (counts.get(weekKey) ?? 0) >= threshold;

  let closedWeeks = 0;
  let exhausted = false;
  let weekKey = shiftWeekKey(currentWeekKey, -1);

  while (counts.has(weekKey)) {
    if (!met(weekKey)) break;
    closedWeeks++;
    weekKey = shiftWeekKey(weekKey, -1);
    if (!counts.has(weekKey)) exhausted = true;
  }

  const includesCurrentWeek = met(currentWeekKey);
  return {
    closedWeeks,
    includesCurrentWeek,
    streakWeeks: closedWeeks + (includesCurrentWeek ? 1 : 0),
    exhausted,
  };
}

export type StreakChipState = "met" | "missed" | "current" | "current-met";

export type StreakChip = {
  weekKey: string;
  label: string;
  state: StreakChipState;
  count: number;
  threshold: number;
};

/**
 * The last `weeks` weeks as chips, oldest first — the visual answer to "which
 * weeks counted", so a developer never has to trust a bare number.
 */
export function buildStreakStrip({
  history,
  threshold,
  currentWeekKey,
  weeks = 5,
}: {
  history: WeekQualification[];
  threshold: number;
  currentWeekKey: string;
  weeks?: number;
}): StreakChip[] {
  const counts = countsByWeek(history);
  const chips: StreakChip[] = [];

  for (let offset = weeks - 1; offset >= 0; offset--) {
    const weekKey = shiftWeekKey(currentWeekKey, -offset);
    if (!counts.has(weekKey)) continue;
    const count = counts.get(weekKey) ?? 0;
    const isCurrent = weekKey === currentWeekKey;
    const met = count >= threshold;
    chips.push({
      weekKey,
      label: formatWeekChip(weekKey),
      state: isCurrent
        ? met
          ? "current-met"
          : "current"
        : met
          ? "met"
          : "missed",
      count,
      threshold,
    });
  }

  return chips;
}
