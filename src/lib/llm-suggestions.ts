import { generateStructured } from "@/lib/llm";
import {
  buildPptDraftPrompt,
  buildTaskReasonPrompt,
  PPT_DRAFT_SCHEMA,
  PPT_DRAFT_SYSTEM,
  type PptDraft,
  type PromptDeveloper,
  type PromptIssue,
  TASK_REASON_SCHEMA,
  TASK_REASON_SYSTEM,
} from "@/lib/llm-prompts";

// The drafting surfaces. Every one returns null when the adapter is
// unconfigured or anything goes wrong, and every caller must already work
// without it — these make an existing manual task shorter, they never become
// the only way to do something.

/**
 * Turn a Linear issue into a scoped PPT draft. Prefills the request form; an
 * admin still reviews and submits. Never creates anything on its own.
 */
export async function draftPptFromIssue(
  issue: PromptIssue,
  userId: string | null,
): Promise<PptDraft | null> {
  return generateStructured({
    surface: "ppt_draft",
    userId,
    system: PPT_DRAFT_SYSTEM,
    prompt: buildPptDraftPrompt(issue),
    schema: PPT_DRAFT_SCHEMA,
    // Scope + a handful of acceptance criteria. Generous, not open-ended.
    maxTokens: 1_500,
  });
}

/**
 * A sentence on why this task suits this developer, grounded in the issue
 * rather than in their specialty label. Falls back to the ranker's own
 * deterministic reason, which is always present — so the caller gets a usable
 * string either way and never has to branch on availability.
 */
export async function explainTaskForDeveloper(
  issue: PromptIssue,
  developer: PromptDeveloper,
  deterministicReason: string,
  userId: string | null,
): Promise<string> {
  const result = await generateStructured({
    surface: "task_reason",
    userId,
    system: TASK_REASON_SYSTEM,
    prompt: buildTaskReasonPrompt(issue, developer, deterministicReason),
    schema: TASK_REASON_SCHEMA,
    // One sentence under 140 characters.
    maxTokens: 300,
  });
  return result?.reason?.trim() || deterministicReason;
}
