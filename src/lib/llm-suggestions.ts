import { generateStructured } from "@/lib/llm";
import {
  BACKLOG_SUGGESTION_SCHEMA,
  BACKLOG_SUGGESTION_SYSTEM,
  buildBacklogSuggestionPrompt,
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
): Promise<PptDraft | null> {
  return generateStructured({
    system: PPT_DRAFT_SYSTEM,
    prompt: buildPptDraftPrompt(issue),
    schema: PPT_DRAFT_SCHEMA,
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
): Promise<string> {
  const result = await generateStructured({
    system: TASK_REASON_SYSTEM,
    prompt: buildTaskReasonPrompt(issue, developer, deterministicReason),
    schema: TASK_REASON_SCHEMA,
  });
  return result?.reason?.trim() || deterministicReason;
}

/**
 * Which backlog issues could become paid tasks, and roughly for whom. Output
 * is a review queue: nothing here is created, assigned, or announced.
 */
export async function triageBacklogForPpts(
  issues: PromptIssue[],
  roster: PromptDeveloper[],
) {
  if (issues.length === 0) return null;
  return generateStructured({
    system: BACKLOG_SUGGESTION_SYSTEM,
    prompt: buildBacklogSuggestionPrompt(issues, roster),
    schema: BACKLOG_SUGGESTION_SCHEMA,
  });
}
