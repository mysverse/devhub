/**
 * Everything that differs between the fields that offer writing help.
 *
 * The same shape as PPT_COMPOSER_MODES: one table, no React, no Prisma, no
 * server imports, so the client bar and the server action read the identical
 * rules and a unit test can check them against the validators that actually
 * enforce them.
 *
 * **This table is the whole surface.** A field that is not in it has no writing
 * help, which is how the exclusions stay exclusions: KYC review notes, conflict
 * of interest disclosures, welcome-pack orders and addresses, and the
 * payment-issue email are absent on purpose, not by oversight. A conflict
 * disclosure is a legal statement by the person making it — polishing it
 * changes what a signed document means — and the rest carry personal data that
 * has no business crossing to a provider at all.
 *
 * Every `maxChars` here is checked against the real enforcer in
 * `ai-assist-config.test.ts`. That is the PROOF_MIN_CHARS lesson from
 * `ppt-composer-config.ts`: a table that promises a number the server disagrees
 * with produces a rewrite that is silently truncated after the person accepts
 * it.
 */

import { PROOF_MIN_CHARS } from "@/lib/payout-policy";

export type AiAssistAction = "polish" | "expand" | "shorten" | "structure";

export type AiAssistFieldId =
  | "ppt_proof"
  | "ppt_progress"
  | "ppt_request_description"
  | "ppt_request_note"
  | "task_suggestion_note"
  | "campaign_headline"
  | "campaign_body"
  | "ppt_override_justification"
  | "assignment_watch_note"
  | "claim_takeover_reason"
  | "blocked_details"
  | "payout_reject_reason"
  | "bonus_reject_reason"
  | "ppt_request_reject_reason";

export type AiAssistFieldConfig = {
  id: AiAssistFieldId;
  /**
   * `LlmCall.surface`. One per field *family*, not per field: `surface` has to
   * stay readable as "where is spend going", which fourteen rows would not be
   * and a single `writing_assist` would not answer.
   */
  surface: string;
  /** Second person, used in copy: "your proof comment". Never names a person. */
  label: string;
  audience: "developer" | "admin";
  /**
   * Ordered, at most three. A fourth button wraps the row at 390px, which is
   * what `pnpm visual` fails on.
   */
  actions: AiAssistAction[];
  /** What "good" means for this field. Appended to the shared system prompt. */
  houseStyle: string;
  maxTokens: number;
  /** Below this the button is disabled and no call is made. */
  minInputChars: number;
  /** Hard ceiling, matching whatever actually enforces this field. */
  maxChars: number;
  /** Markdown is fine in a Linear comment; a headline renders as one line. */
  allowMarkdown: boolean;
  /** The advisory pre-post pass, where one is offered. */
  review: { surface: string; maxTokens: number } | null;
};

export const AI_ASSIST_ACTIONS: Record<
  AiAssistAction,
  { label: string; instruction: string }
> = {
  polish: {
    label: "Polish",
    instruction:
      "Tighten the wording and fix grammar. Keep every fact, number, link and name exactly as written. Do not add claims that are not already there.",
  },
  expand: {
    label: "Expand",
    instruction:
      "Fill in what a reader would have to ask about, using only what the draft already implies. Never invent a result, a location or a verification that the author did not state.",
  },
  shorten: {
    label: "Shorten",
    instruction:
      "Cut it down to the shortest version that keeps every fact, number and link. Remove hedging and repetition, not content.",
  },
  structure: {
    label: "Structure",
    instruction:
      "Reorganise the same content under the headings this field expects. Move sentences, do not invent them; if a heading has nothing to sit under it, leave it out.",
  },
};

/** A PPT comment goes to Linear, where a name cannot be taken back. */
const LINEAR_BOUND =
  " This text is posted to Linear, which is outside DevHub's control — never introduce a person's name, email, or contact detail that is not already in the draft.";

export const AI_ASSIST_FIELDS: Record<AiAssistFieldId, AiAssistFieldConfig> = {
  ppt_proof: {
    id: "ppt_proof",
    surface: "write_ppt_proof",
    label: "your proof comment",
    audience: "developer",
    actions: ["structure", "polish", "expand"],
    houseStyle: `A proof comment is read by an admin deciding whether to release a payout. It should say what changed, where a reviewer can see it live, and how the author verified it. Keep every link, screenshot reference, commit SHA and issue identifier — those are the evidence, and losing one costs the author the payout. Never claim a verification the draft does not state. Keep it at least ${PROOF_MIN_CHARS} characters.${LINEAR_BOUND}`,
    maxTokens: 1_200,
    minInputChars: 40,
    // PPT_COMPOSER_MODES.proof.maxChars
    maxChars: 8_000,
    allowMarkdown: true,
    review: { surface: "review_ppt_proof", maxTokens: 500 },
  },
  ppt_progress: {
    id: "ppt_progress",
    surface: "write_ppt_progress",
    label: "your progress note",
    audience: "developer",
    actions: ["structure", "polish", "shorten"],
    houseStyle: `A progress note tells a reviewer the task is moving rather than stalled: what has been done since last time, anything blocking it, and what is next. Short is good. Do not turn it into a proof comment — it is not claiming the task is finished.${LINEAR_BOUND}`,
    maxTokens: 900,
    minInputChars: 30,
    // PPT_COMPOSER_MODES.progress.maxChars
    maxChars: 4_000,
    allowMarkdown: true,
    review: null,
  },
  ppt_request_description: {
    id: "ppt_request_description",
    surface: "write_ppt_request",
    label: "the task description",
    audience: "developer",
    actions: ["structure", "polish", "expand"],
    houseStyle:
      "This describes work someone else will pick up and be paid for. It should say what changes, where, and how a reviewer will know it worked. Acceptance criteria must be checkable by looking at something — a place in the game, a file, a behaviour — not by judging effort. Do not invent requirements the draft does not imply.",
    maxTokens: 1_200,
    minInputChars: 40,
    maxChars: 6_000,
    allowMarkdown: true,
    review: null,
  },
  ppt_request_note: {
    id: "ppt_request_note",
    surface: "write_ppt_request",
    label: "your note to the admin",
    audience: "developer",
    actions: ["polish", "shorten"],
    houseStyle:
      "One or two sentences to an admin on why this work should be paid as a PPT. Make the case concretely; do not restate the task description.",
    maxTokens: 400,
    minInputChars: 20,
    maxChars: 600,
    allowMarkdown: false,
    review: null,
  },
  task_suggestion_note: {
    id: "task_suggestion_note",
    surface: "write_task_suggestion",
    label: "your note to the developer",
    audience: "admin",
    actions: ["polish", "shorten"],
    houseStyle:
      "A short note to one developer about why this task is being pointed at them — context, urgency, or who to ask. Warm and specific, never flattery. It sits alongside DevHub's own match reason, so do not repeat it.",
    maxTokens: 400,
    minInputChars: 15,
    // task-suggestion-actions.ts: z.string().trim().max(500)
    maxChars: 500,
    allowMarkdown: false,
    review: null,
  },
  campaign_headline: {
    id: "campaign_headline",
    surface: "write_campaign",
    label: "the campaign headline",
    audience: "admin",
    actions: ["polish", "shorten"],
    houseStyle:
      "One line every developer sees on the promo banner. Concrete and energetic, no exclamation marks, no emoji. Do not state the multiplier or any amount — DevHub renders those itself, and a headline that disagrees with the real rate is worse than a dull one.",
    maxTokens: 200,
    minInputChars: 8,
    // CAMPAIGN_LIMITS.headline
    maxChars: 120,
    allowMarkdown: false,
    review: null,
  },
  campaign_body: {
    id: "campaign_body",
    surface: "write_campaign",
    label: "the campaign details",
    audience: "admin",
    actions: ["polish", "expand", "shorten"],
    houseStyle:
      "A short paragraph telling developers what the campaign covers and how long it runs, in plain language. Do not state the multiplier, a rate, or a total — DevHub renders those from the real configuration.",
    maxTokens: 400,
    minInputChars: 25,
    // CAMPAIGN_LIMITS.body
    maxChars: 500,
    allowMarkdown: false,
    review: null,
  },
  ppt_override_justification: {
    id: "ppt_override_justification",
    surface: "write_admin_note",
    label: "your override justification",
    audience: "admin",
    actions: ["polish", "expand"],
    houseStyle:
      "This is an audit record explaining why a PPT is payable without proof from the assignee. It has to stand up months later to someone who was not in the room: what was checked, by whom, and why the normal evidence is missing. Never soften it.",
    maxTokens: 400,
    minInputChars: 25,
    // ppt-eligibility-actions.ts truncates to 1000
    maxChars: 1_000,
    allowMarkdown: false,
    review: null,
  },
  assignment_watch_note: {
    id: "assignment_watch_note",
    surface: "write_admin_note",
    label: "your note on this assignment",
    audience: "admin",
    actions: ["polish", "shorten"],
    houseStyle: `An admin note about a watched assignment, seen by the developer and recorded on the task. Factual and kind — it is usually about someone who has gone quiet. Say what is happening and what happens next.${LINEAR_BOUND}`,
    maxTokens: 400,
    minInputChars: 15,
    // ppt-assignment-watch-actions.ts cleanNote() truncates to 1000
    maxChars: 1_000,
    allowMarkdown: false,
    review: null,
  },
  claim_takeover_reason: {
    id: "claim_takeover_reason",
    surface: "write_task_note",
    label: "your takeover reason",
    audience: "developer",
    actions: ["polish", "expand"],
    houseStyle:
      "The previous assignee reads this. Say plainly why the task is being taken over without implying they did anything wrong. At least 10 characters, and short is fine.",
    maxTokens: 400,
    minInputChars: 10,
    maxChars: 600,
    allowMarkdown: false,
    review: null,
  },
  blocked_details: {
    id: "blocked_details",
    surface: "write_task_note",
    label: "what is blocking this",
    audience: "developer",
    actions: ["polish", "expand"],
    houseStyle:
      "Admins read this to unblock the task. Name the specific thing being waited on and who or what would unblock it. A vague blocker cannot be actioned.",
    maxTokens: 400,
    minInputChars: 15,
    maxChars: 800,
    allowMarkdown: false,
    review: null,
  },
  payout_reject_reason: {
    id: "payout_reject_reason",
    surface: "write_admin_note",
    label: "the rejection reason",
    audience: "admin",
    actions: ["polish", "expand"],
    houseStyle:
      "A developer reads this in an email about money they expected. Say exactly why it was rejected and what, if anything, they can do about it. Never apologise vaguely and never leave them guessing. Do not mention bank, payment or identity details.",
    maxTokens: 400,
    minInputChars: 15,
    maxChars: 600,
    allowMarkdown: false,
    review: null,
  },
  bonus_reject_reason: {
    id: "bonus_reject_reason",
    surface: "write_admin_note",
    label: "the rejection reason",
    audience: "admin",
    actions: ["polish", "expand"],
    houseStyle:
      "A note on the review record for a bonus candidate that was not approved. State the reason concretely against the work itself. Do not mention amounts.",
    maxTokens: 400,
    minInputChars: 15,
    maxChars: 600,
    allowMarkdown: false,
    review: null,
  },
  ppt_request_reject_reason: {
    id: "ppt_request_reject_reason",
    surface: "write_admin_note",
    label: "the rejection reason",
    audience: "admin",
    actions: ["polish", "expand"],
    houseStyle:
      "The developer who raised this request reads it. Say why it is not becoming a PPT and what would change that, so the next request is better. Be direct and encouraging.",
    maxTokens: 400,
    minInputChars: 15,
    maxChars: 600,
    allowMarkdown: false,
    review: null,
  },
};

export function aiAssistField(id: string): AiAssistFieldConfig | null {
  return (AI_ASSIST_FIELDS as Record<string, AiAssistFieldConfig>)[id] ?? null;
}

export type AiAssistEligibility =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long" };

/**
 * Whether this draft is worth spending a call on. Enforced on the client so the
 * button can be disabled with a reason, and again on the server so the check is
 * real rather than advisory.
 */
export function assistEligibility(
  config: AiAssistFieldConfig,
  text: string,
): AiAssistEligibility {
  const trimmed = text.trim();
  if (trimmed.length < config.minInputChars) {
    return { ok: false, reason: "too_short" };
  }
  if (trimmed.length > config.maxChars)
    return { ok: false, reason: "too_long" };
  return { ok: true };
}

/**
 * Bring a reply inside the field's ceiling.
 *
 * Cutting mid-word is the visible tell that something truncated the text, and
 * the person is about to post it somewhere permanent — so back up to the last
 * whitespace and drop the partial word. A reply with no whitespace at all in
 * its last stretch falls back to a hard cut, which is still better than
 * silently overflowing the validator that runs after Accept.
 */
export function clampAssistOutput(config: AiAssistFieldConfig, text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= config.maxChars) return trimmed;

  const cut = trimmed.slice(0, config.maxChars);
  const lastBreak = cut.search(/\s\S*$/);
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd();
}
