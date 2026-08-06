"use server";

import { getSession } from "@/lib/auth-utils";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { isLlmConfigured } from "@/lib/llm";
import prisma from "@/lib/prisma";
import { rankedTaskToIdea, type TaskIdea } from "@/lib/task-idea";
import {
  fetchBacklogIssues,
  generateIdeasForDeveloper,
  type IdeaScope,
} from "@/lib/task-ideas-server";
import { rankPptsForUser } from "@/lib/task-recommendation-server";

/** Free text the developer typed. Bounded before it reaches a prompt. */
const MAX_REQUEST_CHARS = 600;

export type GenerateIdeasResult =
  | { error: string; reauth?: true }
  | { ideas: TaskIdea[]; llmUsed: boolean };

/**
 * Ideas for whoever is asking. Deliberately takes no userId — ideas are
 * always generated for the caller, so one developer can never generate
 * against another's context.
 */
export async function generateTaskIdeas(input: {
  prompt?: string;
  teamId?: string | null;
  teamName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}): Promise<GenerateIdeasResult> {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { specialties: true, developerRank: true, linearId: true },
  });
  if (!profile) return { error: "Profile not found" };

  const scope: IdeaScope = {
    teamId: input.teamId ?? null,
    teamName: input.teamName ?? null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
  };
  const request = input.prompt?.trim().slice(0, MAX_REQUEST_CHARS) || null;

  try {
    // The deterministic floor: the open board, ranked for this developer.
    // Computed first and always, so a missing key or a model failure still
    // leaves the page useful.
    const openTasks = await getSuggestedPptsForUser(userId);
    const ranked = await rankPptsForUser(userId, openTasks);
    const issueById = new Map(openTasks.map((issue) => [issue.id, issue]));
    const rankedIdeas = ranked.map((entry) =>
      rankedTaskToIdea(entry, { url: issueById.get(entry.task.id)?.url }),
    );

    if (!isLlmConfigured()) {
      return { ideas: rankedIdeas.slice(0, 5), llmUsed: false };
    }

    const backlog = await withLinearFallback(userId, (client) =>
      fetchBacklogIssues(client, scope),
    );

    return await generateIdeasForDeveloper({
      userId,
      linearId: profile.linearId,
      profile: {
        specialties: profile.specialties,
        developerRank: profile.developerRank,
      },
      rankedIdeas,
      backlog,
      scope,
      request,
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    console.error("[ideas] generation failed:", e);
    return { error: "Couldn't generate ideas just now — try again shortly." };
  }
}
