"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth-utils";
import { TAGS } from "@/lib/cache-tags";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { isLlmConfigured } from "@/lib/llm";
import { draftPptFromIssue } from "@/lib/llm-suggestions";
import {
  evaluatePptIssueById,
  postPptProofComment,
} from "@/lib/ppt-eligibility";
import { hasMeaningfulPptProgress } from "@/lib/ppt-progress";
import prisma from "@/lib/prisma";

/**
 * Draft a PPT description and estimate from a Linear issue the developer has
 * already picked. Optional by construction: returns { available: false } when
 * the LLM adapter isn't configured, and the form works exactly as before.
 */
export async function draftPptFromLinearIssue(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  if (!isLlmConfigured()) return { available: false as const };

  try {
    const draft = await withLinearFallback(userId, async (client) => {
      const [issue] = await fetchIssuesByIds(client, [issueId]);
      if (!issue) return null;
      return draftPptFromIssue(
        {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          labelNames: issue.labelNames,
          estimate: issue.estimate,
        },
        userId,
      );
    });

    if (!draft) return { available: true as const, draft: null };
    return { available: true as const, draft };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    // Drafting is a convenience; never surface it as a failure of the form.
    return { available: true as const, draft: null };
  }
}

export async function getLinearTeams() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    return await withLinearFallback(userId, async (client) => {
      const teams = await client.teams();
      return {
        teams: teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to fetch teams" };
  }
}

export async function getLinearProjects(teamId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    return await withLinearFallback(userId, async (client) => {
      const team = await client.team(teamId);
      const projects = await team.projects();
      return {
        projects: projects.nodes.map((p) => ({ id: p.id, name: p.name })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to fetch projects" };
  }
}

export async function searchLinearUsers(query: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const needle = query.trim().toLowerCase();
  if (!needle) return { users: [] };

  try {
    return await withLinearFallback(userId, async (client) => {
      const users = await client.users({ first: 50 });
      return {
        users: users.nodes
          .filter((user) => {
            const haystack = [user.name, user.displayName, user.email]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(needle);
          })
          .slice(0, 10)
          .map((user) => ({
            id: user.id,
            name: user.displayName || user.name || "Unknown",
            email: user.email ?? null,
            avatarUrl: user.avatarUrl ?? null,
          })),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to search users" };
  }
}

export async function searchLinearIssues(query: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  if (!query.trim()) return { issues: [] };

  try {
    return await withLinearFallback(userId, async (client) => {
      const results = await client.searchIssues(query, { first: 10 });

      // Get existing PPT requests to flag them
      const issueIds = results.nodes.map((i) => i.id);
      const existingRequests = await prisma.pptRequest.findMany({
        where: {
          linearIssueId: { in: issueIds },
          status: { in: ["PENDING", "APPROVED"] },
        },
        select: { linearIssueId: true },
      });
      const requestedIssueIds = new Set(
        existingRequests.map((r) => r.linearIssueId),
      );

      const issues = await Promise.all(
        results.nodes.map(async (searchResult) => {
          // Fetch full issue to access labels
          const issue = await client.issue(searchResult.id);
          const state = await issue.state;
          const labels = await issue.labels();
          const team = await issue.team;
          const hasPptLabel = labels.nodes.some(
            (l) => l.name.toUpperCase() === "PPT",
          );
          return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
            teamId: team?.id ?? "",
            stateType: state?.type ?? "unknown",
            stateName: state?.name ?? "Unknown",
            estimate: issue.estimate ?? null,
            hasPptLabel,
            hasExistingRequest: requestedIssueIds.has(issue.id),
          };
        }),
      );

      // Filter out completed/cancelled issues
      return {
        issues: issues.filter(
          (i) => i.stateType !== "completed" && i.stateType !== "canceled",
        ),
      };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    return { error: (e as Error).message || "Failed to search issues" };
  }
}

export async function submitPptProof(issueId: string, body: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    const result = await postPptProofComment({ userId, issueId, body });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return result;
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to submit proof" };
  }
}

export async function submitPptProgress(issueId: string, body: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const progressBody = body.trim();
  if (!hasMeaningfulPptProgress(progressBody)) {
    return { error: "Add a meaningful progress update before posting." };
  }

  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { linearId: true },
    });
    if (!profile?.linearId) {
      return { error: "Link your Linear account before posting progress." };
    }

    const watch = await prisma.pptAssignmentWatch.findUnique({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issueId,
          assigneeLinearId: profile.linearId,
        },
      },
      select: { id: true, status: true },
    });
    if (
      !watch ||
      watch.status === "UNASSIGNED" ||
      watch.status === "RESOLVED"
    ) {
      return { error: "This PPT is not currently watched as your assignment." };
    }

    await withLinearFallback(userId, async (client) => {
      await client.createComment({ issueId, body: progressBody });
    });

    await prisma.pptAssignmentWatch.update({
      where: { id: watch.id },
      data: {
        status: "ACTIVE",
        lastActivityAt: new Date(),
        warnedAt: null,
        snoozedUntil: null,
        snoozeReason: null,
      },
    });

    revalidateTag(TAGS.userIssues(profile.linearId), { expire: 0 });
    revalidateTag(TAGS.workspacePpts, { expire: 0 });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to post progress update" };
  }
}

export async function retryPptPayoutCheck(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    await evaluatePptIssueById(issueId, { userId, trigger: "developer_retry" });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    const err = e as Error;
    return { error: err.message || "Failed to retry payout check" };
  }
}
