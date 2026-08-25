/**
 * Forward-looking duration copy, in one place.
 *
 * Six near-identical implementations of this had accumulated across the
 * dashboard (the assignment countdown, the campaign banner, two admin
 * "time ago" helpers, the welcome-pack form, the campaign remaining label),
 * each with slightly different rounding and wording.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3d 4h" / "5h 12m" / "42m" / "now" — the coarse form, for a 60s tick. */
export function formatRemaining(ms: number) {
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * "in 3d 4h" / "any moment now" — the sentence form.
 *
 * Deliberately not "in 0m": a countdown that has run out is waiting on a cron,
 * and saying so is honest about the up-to-an-hour gap between the two.
 */
export function formatTimeUntil(target: Date, now: Date = new Date()) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "any moment now";
  return `in ${formatRemaining(ms)}`;
}

/** Absolute, unambiguous, and stable between server and client. */
export function formatAbsoluteUtc(date: Date) {
  return `${date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}, ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}
