import type { LinearClient } from "@linear/sdk";
import { getAssignedActiveIssuesForUser } from "@/lib/linear-data";
import { isLlmConfigured } from "@/lib/llm";
import type {
  PromptDeveloperContext,
  PromptIssue,
  PromptScope,
} from "@/lib/llm-prompts";
import { proposeTaskIdeas } from "@/lib/llm-suggestions";
import prisma from "@/lib/prisma";
import {
  clampEstimate,
  rankedTaskToIdea,
  type TaskIdea,
} from "@/lib/task-idea";
import { getRecommendationHistory } from "@/lib/task-recommendation-server";
import { searchWikiArticles } from "@/lib/wiki-search";

// Turns "what should I work on" into concrete ideas: the open board ranked for
// this developer, plus — when the adapter is configured — backlog issues and
// original work the model proposes from their context.
//
// The ranker is the floor, not a fallback of last resort. It needs no API key,
// no network beyond Linear, and always produces something, so the page is
// useful with ANTHROPIC_API_KEY unset (which is how production runs).

/** Issues to consider from the backlog. Bounded: this is one prompt. */
const BACKLOG_LIMIT = 30;
const PPT_LABEL = "PPT";

export type IdeaScope = {
  teamId?: string | null;
  teamName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
};

/**
 * What this developer has done, narrowed to the enums, numbers and issue text
 * the prompt is allowed to see. Never a name, never money — see
 * PromptDeveloperContext.
 */
export async function getPromptContextForUser(
  userId: string,
  linearId: string | null,
): Promise<PromptDeveloperContext> {
  const [history, completed, active] = await Promise.all([
    getRecommendationHistory(userId),
    prisma.pptPayoutState.findMany({
      where: { userId, status: "PAID" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { linearIssueTitle: true },
    }),
    linearId
      ? getAssignedActiveIssuesForUser(userId, linearId).catch(() => [])
      : Promise.resolve([]),
  ]);

  return {
    completedEstimates: history.completedEstimates,
    provenSpecialties: history.completedSpecialties,
    recentCompletedTitles: completed
      .map((state) => state.linearIssueTitle)
      .filter((title): title is string => Boolean(title)),
    activeTitles: active.map((issue) => issue.title).filter(Boolean),
  };
}

/**
 * Unassigned, non-PPT issues in a backlog or todo state.
 *
 * Uses the SDK's typed filter rather than a new GraphQL document: `assignee`
 * and `state` are already supported by both the SDK and the dev mock, so this
 * needs no schema-snapshot edit and no `linear:validate` exposure. Team and
 * project are filtered here instead — the mock's filter support stops at
 * labels/assignee/state/id/completedAt, and the volume is small enough that
 * narrowing in TypeScript costs nothing.
 */
export async function fetchBacklogIssues(
  client: LinearClient,
  scope: IdeaScope,
): Promise<PromptIssue[]> {
  const response = await client.issues({
    first: 100,
    filter: {
      assignee: { null: true },
      state: { type: { in: ["backlog", "unstarted"] } },
    },
  });

  const issues: PromptIssue[] = [];
  for (const issue of response.nodes) {
    const labels = (await issue.labels()).nodes.map((label) => label.name);
    if (labels.some((name) => name.toUpperCase() === PPT_LABEL)) continue;

    if (scope.teamId) {
      const team = await issue.team;
      if (team?.id !== scope.teamId) continue;
    }
    if (scope.projectId) {
      const project = await issue.project;
      if (project?.id !== scope.projectId) continue;
    }

    issues.push({
      // Enumerated, never spread: IssueDTO carries assignee name and avatar,
      // and PromptIssue deliberately has no field for them.
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? null,
      labelNames: labels,
      estimate: issue.estimate ?? null,
    });
    if (issues.length >= BACKLOG_LIMIT) break;
  }
  return issues;
}

export type GeneratedIdeas = {
  ideas: TaskIdea[];
  /** False when the ranker alone produced this — no key, or the model declined. */
  llmUsed: boolean;
};

/**
 * Ranked open PPTs, then model suggestions layered on top.
 *
 * The model is given issue identifiers and returns identifiers; it never sees
 * or supplies an internal id or URL. Every "existing" idea is re-anchored
 * against the exact backlog that was sent, and anything that doesn't match is
 * demoted to "original" rather than trusted — the model cannot invent a
 * reference to an issue that wasn't offered.
 */
export async function generateIdeasForDeveloper(input: {
  userId: string;
  linearId: string | null;
  profile: { specialties: string[]; developerRank: string };
  rankedIdeas: TaskIdea[];
  backlog: PromptIssue[];
  scope: IdeaScope;
  request: string | null;
  gameFilter?: string | null;
  limit?: number;
}): Promise<GeneratedIdeas> {
  const limit = input.limit ?? 5;
  const rankedIdeas = input.rankedIdeas.slice(0, limit);

  if (!isLlmConfigured() || input.backlog.length === 0) {
    return { ideas: rankedIdeas, llmUsed: false };
  }

  const [context, wikiResults] = await Promise.all([
    getPromptContextForUser(input.userId, input.linearId),
    searchWikiArticles(input.request || "gameplay experience mechanics", {
      game: input.gameFilter,
      specialties: input.profile.specialties,
      limit: 3,
    }),
  ]);

  const promptScope: PromptScope = {
    teamName: input.scope.teamName ?? null,
    projectName: input.scope.projectName ?? null,
  };

  const suggestions = await proposeTaskIdeas({
    developer: {
      ref: "dev-1",
      specialties: input.profile
        .specialties as PromptDeveloperContext["provenSpecialties"],
      developerRank: input.profile.developerRank,
    },
    context,
    backlog: input.backlog,
    scope: promptScope,
    request: input.request,
    limit,
    userId: input.userId,
  });

  if (!suggestions) return { ideas: rankedIdeas, llmUsed: false };

  const backlogByIdentifier = new Map(
    input.backlog.map((issue) => [issue.identifier, issue]),
  );

  const modelIdeas: TaskIdea[] = suggestions.ideas.map((idea, index) => {
    const anchorIssue =
      idea.kind === "existing" && idea.identifier
        ? backlogByIdentifier.get(idea.identifier)
        : undefined;

    const wikiMatch = wikiResults[index % (wikiResults.length || 1)]?.article;

    return {
      ref: `model:${index}`,
      title: idea.title,
      scope: idea.scope,
      acceptanceCriteria: idea.acceptanceCriteria,
      estimate: clampEstimate(idea.estimate),
      specialty: idea.specialty,
      because: idea.because?.trim() || "Suggested from your recent work.",
      origin: "model",
      wikiReference: wikiMatch
        ? {
            game: wikiMatch.game,
            slug: wikiMatch.slug,
            articleTitle: wikiMatch.title,
            canonicalUrl: wikiMatch.canonicalUrl,
          }
        : null,
      anchor: anchorIssue
        ? {
            kind: "existing",
            linearIssueId: anchorIssue.identifier,
            identifier: anchorIssue.identifier,
            url: null,
            hasPptLabel: false,
            hasExistingRequest: false,
            hasLiveBonusCandidate: false,
          }
        : {
            kind: "original",
            teamId: input.scope.teamId ?? null,
            projectId: input.scope.projectId ?? null,
            projectName: input.scope.projectName ?? null,
          },
    };
  });

  return {
    ideas: [...modelIdeas, ...rankedIdeas].slice(0, limit * 2),
    llmUsed: true,
  };
}

export { rankedTaskToIdea };
