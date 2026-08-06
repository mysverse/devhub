import { generateStructured } from "@/lib/llm";
import {
  buildPptDraftPrompt,
  buildTaskIdeaPrompt,
  buildTaskReasonPrompt,
  PPT_DRAFT_SCHEMA,
  PPT_DRAFT_SYSTEM,
  type PptDraft,
  type PromptDeveloper,
  type PromptDeveloperContext,
  type PromptIssue,
  type PromptScope,
  TASK_IDEA_SCHEMA,
  TASK_IDEA_SYSTEM,
  TASK_REASON_SCHEMA,
  TASK_REASON_SYSTEM,
  type TaskIdeaSuggestions,
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

/**
 * Existing backlog issues worth picking up, plus original work that isn't in
 * Linear yet. Returns null on anything at all going wrong, so the caller
 * falls back to the deterministic ranker.
 */
export async function proposeTaskIdeas(input: {
  developer: PromptDeveloper;
  context: PromptDeveloperContext;
  backlog: PromptIssue[];
  scope: PromptScope | null;
  request: string | null;
  limit: number;
  userId: string | null;
}): Promise<TaskIdeaSuggestions | null> {
  return generateStructured({
    surface: "task_ideas",
    userId: input.userId,
    system: TASK_IDEA_SYSTEM,
    prompt: buildTaskIdeaPrompt({
      developer: input.developer,
      context: input.context,
      backlog: input.backlog,
      scope: input.scope,
      request: input.request,
      limit: input.limit,
    }),
    schema: TASK_IDEA_SCHEMA,
    // Several ideas, each with criteria — the largest shape here, and the
    // reason max_tokens became per-surface.
    maxTokens: 4_000,
  });
}
