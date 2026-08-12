import { generateStructured } from "@/lib/llm";
import {
  buildPptDraftPrompt,
  buildProofReviewPrompt,
  buildTaskIdeaPrompt,
  buildTaskReasonPrompt,
  buildWeekSummaryPrompt,
  PPT_DRAFT_SCHEMA,
  PPT_DRAFT_SYSTEM,
  type PptDraft,
  PROOF_REVIEW_SCHEMA,
  PROOF_REVIEW_SYSTEM,
  type PromptDeveloper,
  type PromptDeveloperContext,
  type PromptIssue,
  type PromptProof,
  type PromptScope,
  type PromptWeek,
  type ProofReviewResult,
  TASK_IDEA_SCHEMA,
  TASK_IDEA_SYSTEM,
  TASK_REASON_SCHEMA,
  TASK_REASON_SYSTEM,
  type TaskIdeaSuggestions,
  WEEK_SUMMARY_SCHEMA,
  WEEK_SUMMARY_SYSTEM,
  type WeekSummaryResult,
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
  /** Compact wiki summaries grounding the model in real game systems. */
  gameWikiContext?: string[] | null;
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
      gameWikiContext: input.gameWikiContext,
    }),
    schema: TASK_IDEA_SCHEMA,
    // Several ideas, each with criteria — the largest shape here, and the
    // reason max_tokens became per-surface.
    maxTokens: 4_000,
  });
}

/**
 * Read one proof comment back to the admin judging it: what is claimed, what
 * they could open to check it, and what it leaves unanswered.
 *
 * Never a verdict — `checkProofBody()` is the only thing in DevHub that says
 * whether proof qualifies, and the schema has no field to disagree with it.
 * Null here simply means the panel shows its deterministic evidence inventory
 * and nothing else, which is how it renders today.
 */
export async function reviewProofForAdmin(
  proof: PromptProof,
  userId: string | null,
): Promise<ProofReviewResult | null> {
  return generateStructured({
    surface: "proof_review",
    userId,
    system: PROOF_REVIEW_SYSTEM,
    prompt: buildProofReviewPrompt(proof),
    schema: PROOF_REVIEW_SCHEMA,
    // A summary, a handful of claims and a few questions. Never a draft.
    maxTokens: 800,
  });
}

/**
 * Two lines over a developer's own week. The card underneath already renders
 * every number deterministically, so null here costs nothing but the prose.
 */
export async function summarizeMyWeek(
  week: PromptWeek,
  userId: string,
): Promise<WeekSummaryResult | null> {
  return generateStructured({
    surface: "week_summary",
    userId,
    system: WEEK_SUMMARY_SYSTEM,
    prompt: buildWeekSummaryPrompt(week),
    schema: WEEK_SUMMARY_SCHEMA,
    // A headline and one next step. Nothing here is a draft.
    maxTokens: 500,
  });
}
