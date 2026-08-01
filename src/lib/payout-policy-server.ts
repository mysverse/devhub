import {
  DEFAULT_IDLE_NUDGE_HOURS,
  DEFAULT_SELF_BLOCK_HOURS,
  DEFAULT_SNOOZE_HOURS,
  DEFAULT_STABILITY_MINUTES,
  DEFAULT_UNASSIGN_HOURS,
  DEFAULT_WARN_HOURS,
  type PayoutPolicy,
} from "./payout-policy";

// Server-side resolution of the payout policy: the DEFAULT_* numbers from
// payout-policy.ts merged with env overrides. Server components resolve once
// and thread the result to client components as props.

function readPositive(raw: string | undefined, fallback: number): number {
  const configured = Number(raw ?? String(fallback));
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function readNonNegative(raw: string | undefined, fallback: number): number {
  const configured = Number(raw ?? String(fallback));
  return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
}

export function getResolvedPayoutPolicy(): PayoutPolicy {
  return {
    stabilityMinutes: readNonNegative(
      process.env.PPT_STABILITY_MINUTES,
      DEFAULT_STABILITY_MINUTES,
    ),
    warnHours: readPositive(
      process.env.PPT_HOGGING_WARNING_HOURS,
      DEFAULT_WARN_HOURS,
    ),
    unassignHours: readPositive(
      process.env.PPT_HOGGING_UNASSIGN_HOURS,
      DEFAULT_UNASSIGN_HOURS,
    ),
    snoozeHours: readPositive(
      process.env.PPT_HOGGING_SNOOZE_HOURS,
      DEFAULT_SNOOZE_HOURS,
    ),
    idleNudgeHours: readPositive(
      process.env.PPT_IDLE_NUDGE_HOURS,
      DEFAULT_IDLE_NUDGE_HOURS,
    ),
    selfBlockHours: readPositive(
      process.env.PPT_SELF_BLOCK_HOURS,
      DEFAULT_SELF_BLOCK_HOURS,
    ),
  };
}
