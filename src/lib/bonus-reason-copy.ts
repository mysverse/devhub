/**
 * Plain-language copy for bonus ineligibility, the sibling of
 * `ppt-reason-copy.ts` and held to the same rule: a developer looking at a task
 * that will not pay should be told what happened and what, if anything, they
 * can do about it.
 *
 * `BonusCandidate.ineligibilityReason` is a short phrase written by
 * `evaluateBonusCandidate` for an operator's eye — "Missing complexity
 * estimate", "Already paid via PPT". Accurate, and useless to someone who does
 * not already know how DevHub works: it names the state without naming the
 * consequence or the fix.
 *
 * Deterministic on purpose. This is a lookup over about eight known phrases;
 * asking a model to paraphrase a table would make an always-available
 * explanation optional, non-reproducible, and billable.
 *
 * Client-safe and Prisma-free, so the bonuses page renders it directly.
 */

export type BonusIneligibilityOwner = "developer" | "admin" | "nobody";

export type BonusIneligibilityCopy = {
  /** What happened, in a sentence addressed to the developer. */
  meaning: string;
  /** What would change it, or null when nothing they do can. */
  nextStep: string | null;
  owner: BonusIneligibilityOwner;
};

const EXCLUDED_LABEL_PREFIX = "Excluded label:";

const COPY: Record<string, BonusIneligibilityCopy> = {
  "Bonuses are disabled": {
    meaning: "Monthly bonuses are switched off at the moment.",
    nextStep: null,
    owner: "admin",
  },
  "No assignee": {
    meaning: "Nobody is assigned to this task in Linear.",
    nextStep: "Assign it to yourself in Linear and refresh.",
    owner: "developer",
  },
  "PPT task": {
    meaning:
      "This is a PPT, and PPT tasks pay through the PPT payout rather than the monthly bonus.",
    nextStep: "Nothing to do — post proof and it pays as a PPT.",
    owner: "developer",
  },
  "Canceled issue": {
    meaning: "The Linear issue was canceled, so no work is owed for it.",
    nextStep: null,
    owner: "nobody",
  },
  "Missing complexity estimate": {
    meaning:
      "The task has no complexity estimate, and the bonus amount is worked out from that estimate.",
    nextStep: "Ask for an estimate on the issue, then refresh the list.",
    owner: "developer",
  },
  "Assignee is not linked to DevHub": {
    meaning:
      "The Linear account assigned to this task isn't connected to a DevHub profile.",
    nextStep: "Reconnect Linear in HR Settings, then refresh.",
    owner: "developer",
  },
  "Already paid via PPT": {
    meaning:
      "This task already has a PPT payout, and a task is never paid twice.",
    nextStep: null,
    owner: "nobody",
  },
};

const FALLBACK: BonusIneligibilityCopy = {
  meaning: "This task doesn't meet the current bonus criteria.",
  nextStep: null,
  owner: "admin",
};

export function explainBonusIneligibility(
  reason: string | null | undefined,
): BonusIneligibilityCopy {
  const trimmed = reason?.trim();
  if (!trimmed) return FALLBACK;

  const known = COPY[trimmed];
  if (known) return known;

  // Configurable exclusions arrive as "Excluded label: Redistributable", so
  // the label has to be read out of the phrase rather than matched whole.
  if (trimmed.startsWith(EXCLUDED_LABEL_PREFIX)) {
    const label = trimmed.slice(EXCLUDED_LABEL_PREFIX.length).trim();
    return {
      meaning: label
        ? `The "${label}" label excludes this task from bonuses.`
        : "A label on this task excludes it from bonuses.",
      nextStep: "Ask an admin whether the label still belongs on it.",
      owner: "admin",
    };
  }

  return FALLBACK;
}
