"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/authz";
import { resolveDisplayName } from "@/lib/display-name";
import { getLinearServiceClient } from "@/lib/linear";
import { fetchSuggestedPpts } from "@/lib/linear-queries";
import { explainTaskForDeveloper } from "@/lib/llm-suggestions";
import {
  DISCORD_CHANNEL,
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notifyWithPreferences,
} from "@/lib/notifications";
import prisma from "@/lib/prisma";
import { PROFILE_DISPLAY_SELECT } from "@/lib/prisma-select";
import { rankPptsForUser } from "@/lib/task-recommendation-server";

// The push side of the board. Everything DevHub offered was pull — a
// developer had to go looking — which is exactly what the team said didn't
// work for them. This lets an admin point one person at one task, with the
// reason, through every channel that person actually reads.

const SuggestSchema = z.object({
  issueId: z.string().min(1),
  userId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export type SuggestableDeveloper = {
  id: string;
  name: string;
  /** The ranker's own reason, so an admin sees why before they send it. */
  because: string;
  /** Has an unanswered suggestion for this task — not merely a past one. */
  alreadySuggested: boolean;
};

/**
 * Who this task suits, best first, with the reason for each. Deliberately
 * returns everyone rather than a shortlist: the ranking is advice, and the
 * admin knows things it doesn't.
 */
export async function getSuggestionCandidates(
  issueId: string,
): Promise<SuggestableDeveloper[]> {
  await requireAdmin();

  const client = getLinearServiceClient();
  if (!client) return [];

  const openTasks = await fetchSuggestedPpts(client);
  const issue = openTasks.find((candidate) => candidate.id === issueId);
  if (!issue) return [];

  const [developers, existing] = await Promise.all([
    prisma.userProfile.findMany({
      where: { role: "DEVELOPER" },
      select: PROFILE_DISPLAY_SELECT,
    }),
    prisma.taskSuggestion.findMany({
      where: { linearIssueId: issueId, outcome: "PENDING" },
      select: { userId: true },
    }),
  ]);
  const suggested = new Set(existing.map((row) => row.userId));

  const scored = await Promise.all(
    developers.map(async (developer) => {
      const ranked = await rankPptsForUser(developer.id, [issue]);
      const match = ranked[0];
      return {
        id: developer.id,
        name: resolveDisplayName({ profile: developer, fallback: "developer" }),
        because: match?.because ?? "open on the board",
        score: match?.score ?? 0,
        alreadySuggested: suggested.has(developer.id),
      };
    }),
  );

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map(({ score: _score, ...developer }) => developer);
}

/**
 * Record the suggestion and tell the developer. The unique constraint on
 * (issue, user) enforces the anti-nag rule at the database rather than in a
 * check that can be raced.
 */
export async function suggestTaskToDeveloper(input: {
  issueId: string;
  userId: string;
  note?: string;
}) {
  const adminId = await requireAdmin();

  const parsed = SuggestSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid suggestion" };
  const { issueId, userId, note } = parsed.data;

  const client = getLinearServiceClient();
  if (!client) return { error: "Linear is not configured" };

  const issue = (await fetchSuggestedPpts(client)).find(
    (candidate) => candidate.id === issueId,
  );
  if (!issue) return { error: "That task is no longer open on the board" };
  if (issue.assignee) return { error: "That task is already claimed" };

  const developer = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      ...PROFILE_DISPLAY_SELECT,
      specialties: true,
      developerRank: true,
      user: { select: { email: true } },
    },
  });
  if (!developer) return { error: "Developer not found" };

  const ranked = await rankPptsForUser(userId, [issue]);
  const deterministicReason = ranked[0]?.because ?? "open on the board";
  // Grounded in the issue text where the adapter is available; falls straight
  // back to the ranker's own reason otherwise, so this never blocks a send.
  const because = await explainTaskForDeveloper(
    {
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      labelNames: issue.labelNames,
      estimate: issue.estimate,
    },
    {
      ref: userId,
      specialties: developer.specialties,
      developerRank: developer.developerRank,
    },
    deterministicReason,
  );

  // Only an OPEN suggestion blocks another. One that went TAKEN or EXPIRED is
  // history — if the task is back on the board, re-suggesting it is the right
  // thing to do, not nagging.
  const openSuggestion = await prisma.taskSuggestion.findFirst({
    where: { linearIssueId: issueId, userId, outcome: "PENDING" },
    select: { id: true },
  });
  if (openSuggestion) {
    return { error: "They already have this task suggested and unanswered" };
  }

  await prisma.taskSuggestion.create({
    data: {
      linearIssueId: issue.id,
      linearIssueIdentifier: issue.identifier,
      linearIssueTitle: issue.title,
      userId,
      suggestedById: adminId,
      reason: because,
      note: note || null,
    },
  });

  await notifyWithPreferences({
    userId,
    actorId: adminId,
    domain: "ppt_task",
    type: "SUGGESTED_TO_YOU",
    title: `Picked out for you: ${issue.identifier}`,
    message: note
      ? `${issue.title} — ${because}. ${note}`
      : `${issue.title} — ${because}.`,
    href: "/dashboard/ppts",
    entityType: "linear_issue",
    entityId: issue.identifier,
    dedupeKey: `ppt-task:suggested:${userId}:${issue.id}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL, DISCORD_CHANNEL],
    email: developer.user.email
      ? {
          to: developer.user.email,
          subject: `A task picked out for you: ${issue.title}`,
          category: "ppt_task_suggested_to_you",
          idempotencyKey: `ppt-task:suggested:${userId}:${issue.id}`,
        }
      : undefined,
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/ppts");
  return { success: true };
}
