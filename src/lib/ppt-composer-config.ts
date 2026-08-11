/**
 * Everything that differs between the two PPT comment composers.
 *
 * The progress note and the proof comment are the same interaction — write
 * markdown, attach evidence, post a Linear comment — with different copy and
 * different rules about what counts as finished. Rather than two components
 * that drift, there is one modal driven by this table (the same shape as
 * TONE_PRESETS in ConfirmModal).
 *
 * Pure on purpose: no React, no Prisma, no server imports. The requirement
 * predicates are the *client half* of rules the server enforces anyway, so
 * they are unit-tested here and delegate to the shared modules rather than
 * re-implementing a length or a keyword check — that divergence is exactly
 * what `ppt-proof.ts` exists to prevent.
 */

import { PROOF_MIN_CHARS } from "@/lib/payout-policy";
import {
  hasMeaningfulPptProgress,
  PPT_PROGRESS_TEMPLATE,
} from "@/lib/ppt-progress";
import { checkProofBody, proofContent } from "@/lib/ppt-proof";

export type PptComposerMode = "progress" | "proof";

/** Everything a requirement can be judged against. */
export type RequirementContext = {
  body: string;
  /** Files already uploaded and ready to be claimed by the comment. */
  attachmentCount: number;
};

export type ComposerRequirement = {
  id: string;
  /** Imperative, second person: what the developer still has to do. */
  label: string;
  /** One line of "why", shown while the row is unmet. */
  hint: string;
  test: (context: RequirementContext) => boolean;
  /**
   * Required rows block the submit and redden after a blocked attempt.
   * Advisory rows are nudges — they never stop anyone posting.
   */
  required: boolean;
};

/** A one-tap insert for the phrases people type on every single comment. */
export type ComposerSnippet = {
  label: string;
  /** Inserted at the caret, on its own line. */
  text: string;
};

export type PptComposerModeConfig = {
  mode: PptComposerMode;
  title: string;
  /** Mantine color key for the submit button and the accent chrome. */
  color: "blue" | "green";
  submitLabel: string;
  /** Sonner copy: the loading toast, then what replaces it on success. */
  pendingToast: string;
  successToast: string;
  /** Fallback error copy when the server action returns none. */
  failureToast: string;
  intro: string;
  placeholder: string;
  /** Starting body. Empty means "start from a blank textarea". */
  template: string;
  snippets: ComposerSnippet[];
  /** Hard cap on the textarea. Linear accepts far more; this is a sanity rail. */
  maxChars: number;
  checklistTitle: string;
  requirements: ComposerRequirement[];
};

/**
 * Advisory only. A URL is the strongest signal, but "it's live on staging" or
 * "in the lobby place" is a perfectly good answer, so this reads for the
 * vocabulary of a location rather than demanding a link — the required
 * evidence row already covers links.
 */
const LOCATION_PATTERN =
  /https?:\/\/|\b(live|deployed|deploy|staging|production|prod|in-?game|place|experience|branch|route|page|screen|dashboard|studio|server|environment|env)\b/i;

/**
 * The `Next step:` heading with something after it. Matched loosely because
 * the template is a starting point, not a form — someone who deletes it and
 * writes "next I'll wire the payout webhook" has answered the question.
 */
const NEXT_HEADING_PATTERN = /next\s*(?:steps?|up)?\s*:/i;
const NEXT_PROSE_PATTERN =
  /\bnext\b|\btomorrow\b|\bthen I(?:'ll| will)\b|\bremaining\b|\bstill to\b/i;

function saysWhereToSeeIt({ body }: RequirementContext) {
  return LOCATION_PATTERN.test(proofContent(body));
}

function saysWhatIsNext({ body }: RequirementContext) {
  const heading = NEXT_HEADING_PATTERN.exec(body);
  if (heading) {
    // The template ends on a bare "Next step:" line, so an untouched template
    // must read as unanswered — only text *after* the heading counts.
    return body.slice(heading.index + heading[0].length).trim().length >= 3;
  }
  return NEXT_PROSE_PATTERN.test(body);
}

export const PPT_COMPOSER_MODES: Record<
  PptComposerMode,
  PptComposerModeConfig
> = {
  progress: {
    mode: "progress",
    title: "Post progress",
    color: "blue",
    submitLabel: "Post Progress",
    pendingToast: "Posting progress update...",
    successToast: "Progress update posted",
    failureToast: "Failed to post progress update",
    intro:
      "This posts a Linear comment and resets the assignment-watch timer. Use the proof flow when the PPT is finished.",
    placeholder: PPT_PROGRESS_TEMPLATE,
    template: PPT_PROGRESS_TEMPLATE,
    snippets: [
      { label: "Blocked on", text: "Blocked on: " },
      { label: "Next step", text: "Next step: " },
      { label: "ETA", text: "ETA: " },
    ],
    maxChars: 4000,
    checklistTitle: "A good progress note",
    requirements: [
      {
        id: "substance",
        label: "Write more than the template headings",
        hint: "The headings alone do not reset the timer — fill in at least one of them.",
        // The same predicate submitPptProgress runs server-side.
        test: ({ body }) => hasMeaningfulPptProgress(body),
        required: true,
      },
      {
        id: "next",
        label: "Say what's next",
        hint: "One line about the next step tells reviewers the task is moving, not stalled.",
        test: saysWhatIsNext,
        required: false,
      },
    ],
  },
  proof: {
    mode: "proof",
    title: "Submit PPT proof",
    color: "green",
    submitLabel: "Submit Proof",
    pendingToast: "Submitting PPT proof...",
    successToast: "PPT proof submitted",
    failureToast: "Failed to submit proof",
    intro:
      "This posts your #ppt-proof comment and runs the payout check. Cover what changed, where to see it, and how you verified it — then attach the evidence.",
    placeholder:
      "What changed:\n\nWhere to see it:\n\nHow I verified it:\n\n(Paste a screenshot with Ctrl/Cmd+V — it uploads straight to Linear.)",
    // Deliberately blank: a proof template would be filled in as a form, and
    // the payout evaluator reads the prose, not the headings.
    template: "",
    snippets: [
      { label: "What changed", text: "What changed: " },
      { label: "Where to see it", text: "Where to see it: " },
      { label: "How I verified", text: "How I verified it: " },
    ],
    maxChars: 8000,
    checklistTitle: "What the payout check looks for",
    requirements: [
      {
        // Interpolated from PROOF_MIN_CHARS so the label can never promise a
        // different number than the rule enforces.
        id: "describe",
        label: `Describe what changed (${PROOF_MIN_CHARS}+ characters)`,
        hint: `The #ppt-proof marker doesn't count toward the ${PROOF_MIN_CHARS} characters.`,
        test: ({ body }) => proofContent(body).length >= PROOF_MIN_CHARS,
        required: true,
      },
      {
        id: "evidence",
        label: "Attach a screenshot or clip, or paste a link",
        hint: "A commit SHA or an issue reference works too. Saying you tested it is not evidence.",
        /**
         * Routed through the shared rule rather than re-testing the evidence
         * pattern here. `checkProofBody` reports the length failure first, so
         * this row can read as met while the body is still too short — but the
         * row above is unmet in exactly that case, and the conjunction of the
         * two required rows is precisely
         * `checkProofBody(body, { hasAttachments }) === null`, which is what
         * the server and the payout evaluator apply. That equivalence is
         * asserted in the tests.
         */
        test: ({ body, attachmentCount }) =>
          attachmentCount > 0 || checkProofBody(body)?.reason !== "no-evidence",
        required: true,
      },
      {
        id: "location",
        label: "Say where to see it live",
        hint: "Name the place, page, or environment a reviewer should open to check it.",
        test: saysWhereToSeeIt,
        required: false,
      },
    ],
  },
};

export type RequirementResult = {
  requirement: ComposerRequirement;
  met: boolean;
};

export function evaluateComposerRequirements(
  mode: PptComposerMode,
  context: RequirementContext,
): RequirementResult[] {
  return PPT_COMPOSER_MODES[mode].requirements.map((requirement) => ({
    requirement,
    met: requirement.test(context),
  }));
}

/** The rows that block a submit, in checklist order. */
export function unmetRequired(results: RequirementResult[]) {
  return results
    .filter((result) => result.requirement.required && !result.met)
    .map((result) => result.requirement);
}

/**
 * Screen-reader announcement for a blocked submit. The visual cue is the
 * shake, which renders as nothing at all under `prefers-reduced-motion`.
 */
export function describeUnmet(requirements: ComposerRequirement[]) {
  if (requirements.length === 0) return "";
  return `Not posted yet. ${requirements.map((requirement) => requirement.label).join(". ")}.`;
}
