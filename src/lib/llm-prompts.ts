import * as z from "zod/v4";
import {
  DEVELOPER_SPECIALTIES,
  type DeveloperSpecialtyValue,
} from "@/lib/developer-access";

// Prompt construction, kept separate from the transport (llm.ts) so it can be
// unit-tested without a network or an API key.
//
// The input types here are the PII boundary. They carry Linear issue text and
// specialty enums and nothing else — no legalName, email, address, bank
// details, or KYC data can be passed in, because there is no field to put it
// in. `pnpm check-pii` guards the display side; this guards the outbound side.

/** Issue content, exactly as much as a draft needs. */
export type PromptIssue = {
  identifier: string;
  title: string;
  description: string | null;
  labelNames: string[];
  estimate: number | null;
};

/** A developer, reduced to what is relevant to scoping work. Never a name. */
export type PromptDeveloper = {
  /** Opaque handle for referring back to a person in the reply. */
  ref: string;
  specialties: DeveloperSpecialtyValue[];
  developerRank: string;
};

function issueBlock(issue: PromptIssue) {
  return [
    `identifier: ${issue.identifier}`,
    `title: ${issue.title}`,
    `labels: ${issue.labelNames.join(", ") || "(none)"}`,
    `current estimate: ${issue.estimate ?? "(unset)"}`,
    `description:\n${issue.description?.trim() || "(none)"}`,
  ].join("\n");
}

// ── PPT draft ──────────────────────────────────────────────────────────────

export const PPT_DRAFT_SCHEMA = z.object({
  title: z.string().describe("Imperative, specific, under 80 characters."),
  scope: z
    .string()
    .describe("What is in scope, in two or three sentences of plain prose."),
  acceptanceCriteria: z
    .array(z.string())
    .describe("Independently checkable conditions for 'done'."),
  estimate: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Complexity 1-5, where 5 is the largest task DevHub pays for."),
  specialty: z
    .enum(DEVELOPER_SPECIALTIES)
    .describe("The single specialty this work most belongs to."),
  reasoning: z
    .string()
    .describe("One sentence on why this estimate and specialty."),
});

export type PptDraft = z.infer<typeof PPT_DRAFT_SCHEMA>;

export const PPT_DRAFT_SYSTEM = `You help an admin turn a Linear issue into a well-scoped paid task (a "PPT") for a small internal Roblox game studio.

A good PPT is one a developer can pick up without asking questions: it says what changes, where, and how the reviewer will know it worked. Acceptance criteria must be checkable by looking at something — a place in the game, a file, a behaviour — not by judging effort.

Estimate 1-5 by complexity, not hours. 1 is a contained tweak; 5 is a task that takes real design work. If the issue is too vague to scope, say so in the reasoning and estimate conservatively rather than inventing requirements.

Write for the developer who will do the work. No preamble, no restating the issue back.`;

export function buildPptDraftPrompt(issue: PromptIssue) {
  return `Draft a PPT from this Linear issue.\n\n${issueBlock(issue)}`;
}

// ── Backlog triage ─────────────────────────────────────────────────────────

export const BACKLOG_SUGGESTION_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      identifier: z.string().describe("The Linear issue identifier."),
      suitable: z
        .boolean()
        .describe("Whether this issue would make a good standalone paid task."),
      reason: z.string().describe("One sentence justifying the verdict."),
      estimate: z.number().int().min(1).max(5).nullable(),
      specialty: z.enum(DEVELOPER_SPECIALTIES).nullable(),
      developerRef: z
        .string()
        .nullable()
        .describe("Best-matching developer ref from the roster, or null."),
    }),
  ),
});

export type BacklogSuggestions = z.infer<typeof BACKLOG_SUGGESTION_SCHEMA>;

export const BACKLOG_SUGGESTION_SYSTEM = `You help an admin find work in a Linear backlog that could become paid tasks ("PPTs") for a small internal Roblox game studio.

Not every issue should be one. Skip anything that is a duplicate, a question, a placeholder, an ongoing chore with no end state, or work that can't be verified by looking at a result. Mark those suitable: false and say why in one sentence — a short honest list is more useful than a long hopeful one.

Match to a developer only from the roster given, and only when a specialty genuinely lines up. Null is the right answer when nothing fits.`;

export function buildBacklogSuggestionPrompt(
  issues: PromptIssue[],
  roster: PromptDeveloper[],
) {
  const rosterBlock = roster.length
    ? roster
        .map(
          (developer) =>
            `- ${developer.ref}: ${developer.developerRank}, specialties: ${
              developer.specialties.join(", ") || "(none declared)"
            }`,
        )
        .join("\n")
    : "(no developers available)";

  return [
    "Roster:",
    rosterBlock,
    "",
    "Backlog issues:",
    issues.map(issueBlock).join("\n---\n"),
  ].join("\n");
}

// ── Recommendation reason ──────────────────────────────────────────────────

export const TASK_REASON_SCHEMA = z.object({
  reason: z
    .string()
    .describe(
      "One sentence, under 140 characters, addressed to the developer.",
    ),
});

export const TASK_REASON_SYSTEM = `You write one sentence explaining why a specific open task suits a specific developer, for a small internal Roblox game studio.

Ground it in what the task actually involves — not flattery, not a restatement of their specialty. If the task and the developer don't obviously match, say what they'd get out of it instead. Under 140 characters, addressed to them directly, no greeting.`;

export function buildTaskReasonPrompt(
  issue: PromptIssue,
  developer: PromptDeveloper,
  deterministicReason: string,
) {
  return [
    issueBlock(issue),
    "",
    `developer specialties: ${developer.specialties.join(", ") || "(none declared)"}`,
    `developer rank: ${developer.developerRank}`,
    `DevHub's own match reason: ${deterministicReason}`,
  ].join("\n");
}
