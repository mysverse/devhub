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
 * Something a reviewer can actually open, run, or look at. Prose alone doesn't
 * qualify — proof has to point at evidence.
 */
const EVIDENCE_PATTERN =
  /https?:\/\/|!\[|screenshot|screen|video|clip|drive|figma|roblox|studio|place|asset|implemented|location|verified|tested|before|after|commit|branch|pull request|pr/i;

/** The proof text with the `#ppt-proof` marker removed — what actually counts. */
export function proofContent(body: string) {
  return body.replace(new RegExp(PROOF_TAG, "gi"), "").trim();
}

export type ProofRejectionReason = "too-short" | "no-evidence";

export type ProofRejection = {
  reason: ProofRejectionReason;
  message: string;
};

/**
 * Returns null when the proof qualifies, or the reason it doesn't. Both call
 * sites surface `message` verbatim, so a rejection always says which half of
 * the rule failed.
 */
export function checkProofBody(body: string): ProofRejection | null {
  const content = proofContent(body);

  if (content.length < PROOF_MIN_CHARS) {
    return {
      reason: "too-short",
      message: `Proof is too short — write at least ${PROOF_MIN_CHARS} characters covering what changed and where to verify it.`,
    };
  }

  if (!EVIDENCE_PATTERN.test(content)) {
    return {
      reason: "no-evidence",
      message:
        "Add something checkable — a link, screenshot, commit, branch, or where in the game it's live. Payout can't be released on a description alone.",
    };
  }

  return null;
}

export function isMeaningfulProofBody(body: string) {
  return checkProofBody(body) === null;
}

/** Composer hint, shown before the developer submits rather than after. */
export function describeProofEvidence() {
  return "Include a link, screenshot, commit, or where it's live — proof without one of these can't be verified.";
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
