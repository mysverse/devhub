import { PROOF_MIN_CHARS, PROOF_TAG } from "@/lib/payout-policy";

// The single definition of "is this proof good enough", shared by the Proof
// button (client + server action) and the payout evaluator that reads comments
// back off Linear. These used to be two hard-coded numbers in two places: the
// button accepted 20 characters, the evaluator demanded 40 plus evidence. A
// proof landing in between posted to Linear successfully and then silently
// failed payout, with nothing telling the developer why.
//
// Client-safe and Prisma-free so the composer can run the exact same check
// while the developer is still typing.

/**
 * Evidence is something a reviewer can open, run, or look at — a thing, not a
 * word about a thing.
 *
 * The rule used to accept a list of bare keywords: `screenshot`, `tested`,
 * `verified`, `implemented`, and a `pr` alternative that, being unanchored and
 * case-insensitive, also matched inside "approved", "sprint", "improve" and
 * "press". In practice almost any proof of adequate length cleared the
 * evidence half, so payouts were released against prose that merely *claimed*
 * verification. Saying you took a screenshot is not a screenshot.
 *
 * What counts now: a URL, an embedded image (`![…](…)`, which is what an
 * attachment posts as), a commit SHA, or an issue/PR reference. An attachment
 * also satisfies it directly — see `hasAttachments` on {@link checkProofBody}.
 *
 * Split into two patterns because they need different case sensitivity.
 */
const EVIDENCE_LINK_PATTERN = /https?:\/\/|!\[/i;

/**
 * Case-SENSITIVE on purpose, and split from the link pattern because of it.
 *
 * `[A-Z]{2,6}-\d+` matches a Linear or Jira identifier (`MYS-201`). Made
 * case-insensitive it would also match "step-1", "phase-2" and "part-3",
 * which are prose, not references. The SHA branch requires at least one digit
 * so it cannot match an all-hex-letter English word such as "defaced".
 */
const EVIDENCE_REFERENCE_PATTERN =
  /\b[A-Z]{2,6}-\d+\b|\b(?=[0-9a-f]{7,40}\b)(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b|(?:^|\s)#\d+\b/;

/** True when the text points at something a reviewer can actually check. */
export function hasEvidenceReference(content: string) {
  return (
    EVIDENCE_LINK_PATTERN.test(content) ||
    EVIDENCE_REFERENCE_PATTERN.test(content)
  );
}

/** The proof text with the `#ppt-proof` marker removed — what actually counts. */
export function proofContent(body: string) {
  return body.replace(new RegExp(PROOF_TAG, "gi"), "").trim();
}

export type ProofRejectionReason = "too-short" | "no-evidence";

export type ProofRejection = {
  reason: ProofRejectionReason;
  message: string;
};

export type ProofContext = {
  /**
   * Whether the developer attached a file. Set by the composer, which knows
   * about the upload before the `![…](…)` markdown is appended to the body.
   *
   * Only the evidence half of the rule is waived — PROOF_MIN_CHARS still
   * applies, because a screenshot with no explanation is not proof either.
   * The posted body ends up containing `![`, so the evaluator reaches the same
   * verdict later when it re-reads the comment off Linear without this hint.
   */
  hasAttachments?: boolean;
};

/**
 * Returns null when the proof qualifies, or the reason it doesn't. Both call
 * sites surface `message` verbatim, so a rejection always says which half of
 * the rule failed.
 */
export function checkProofBody(
  body: string,
  context: ProofContext = {},
): ProofRejection | null {
  const content = proofContent(body);

  if (content.length < PROOF_MIN_CHARS) {
    return {
      reason: "too-short",
      message: `Proof is too short — write at least ${PROOF_MIN_CHARS} characters covering what changed and where to verify it.`,
    };
  }

  if (!context.hasAttachments && !hasEvidenceReference(content)) {
    return {
      reason: "no-evidence",
      message:
        "Attach a screenshot or clip, or paste a link, commit SHA, or issue reference. Describing the evidence isn't the same as providing it.",
    };
  }

  return null;
}

export function isMeaningfulProofBody(
  body: string,
  context: ProofContext = {},
) {
  return checkProofBody(body, context) === null;
}

/** Composer hint, shown before the developer submits rather than after. */
export function describeProofEvidence() {
  return "Attach a screenshot or clip, or paste a link, commit SHA, or issue reference — proof without one of these can't be verified.";
}

/**
 * Minimum length for a reviewer comment to count as a real follow-up question.
 * A drive-by "?" used to be enough to reset proof that already qualified,
 * sending a finished task back to WAITING_PROOF for no stated reason.
 */
export const PROOF_QUESTION_MIN_CHARS = 15;

/** DevHub's own bot comment — never treat our guidance as a reviewer question. */
export function isDevHubGuidanceComment(body: string) {
  return body.toLowerCase().includes("devhub payout check");
}

/**
 * A reviewer asking the assignee for something, which pauses payout until it
 * is answered. Requires enough substance to be actionable — see
 * PROOF_QUESTION_MIN_CHARS.
 */
export function isProofFollowUpQuestion(body: string) {
  if (isDevHubGuidanceComment(body)) return false;
  if (body.trim().length < PROOF_QUESTION_MIN_CHARS) return false;
  return /\?|screenshot|proof|provide|details|where|located|implemented|verify|evidence/i.test(
    body,
  );
}
