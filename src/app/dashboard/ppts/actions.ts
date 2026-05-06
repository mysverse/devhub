"use server";

import { revalidatePath } from "next/cache";
import { createElement } from "react";
import PptRequestSubmitted from "@/emails/PptRequestSubmitted";
import { getSession } from "@/lib/auth-utils";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { sendEmail } from "@/lib/email";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import prisma from "@/lib/prisma";

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

export async function submitPptRequest(data: {
  mode: "new" | "existing";
  linearIssueId?: string;
  linearIssueIdentifier?: string;
  linearIssueTitle: string;
  linearIssueUrl?: string;
  linearTeamId: string;
  requestedEstimate: number;
  projectedDueDate: string;
  description?: string;
  note?: string;
}) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  // Validate estimate
  if (data.requestedEstimate < 1 || data.requestedEstimate > 5) {
    return { error: "Complexity must be between 1 and 5" };
  }

  if (!data.linearIssueTitle.trim()) {
    return { error: "Issue title is required" };
  }

  if (!data.linearTeamId.trim()) {
    return { error: "Team is required" };
  }

  const dueDate = new Date(data.projectedDueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return { error: "Valid due date is required" };
  }

  // Check for duplicate request on existing issues
  if (data.mode === "existing" && data.linearIssueId) {
    const existing = await prisma.pptRequest.findFirst({
      where: {
        linearIssueId: data.linearIssueId,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (existing) {
      return { error: "A PPT request already exists for this issue" };
    }
  }

  // Create the request
  const request = await prisma.pptRequest.create({
    data: {
      requesterId: userId,
      linearIssueId: data.mode === "existing" ? data.linearIssueId : null,
      linearIssueIdentifier:
        data.mode === "existing" ? data.linearIssueIdentifier : null,
      linearIssueTitle: data.linearIssueTitle.trim(),
      linearIssueUrl: data.mode === "existing" ? data.linearIssueUrl : null,
      linearTeamId: data.linearTeamId,
      requestedEstimate: data.requestedEstimate,
      projectedDueDate: dueDate,
      description: data.description?.trim() || null,
      note: data.note?.trim() || null,
    },
  });

  // Send email to all admins
  try {
    const admins = await prisma.userProfile.findMany({
      where: ADMIN_ACCESS_WHERE,
      include: { user: { select: { email: true, name: true } } },
    });

    const requester = await prisma.userProfile.findUnique({
      where: { id: userId },
      include: { user: { select: { name: true } } },
    });

    const requesterName =
      requester?.legalName || requester?.user.name || "A developer";
    const estimatedAmount = formatAmount(
      estimateToAmount(data.requestedEstimate, "MYR"),
      "MYR",
    );

    for (const admin of admins) {
      if (!admin.user.email) continue;
      await sendEmail({
        to: admin.user.email,
        subject: `New PPT Request: ${data.linearIssueTitle}`,
        react: createElement(PptRequestSubmitted, {
          requesterName,
          issueTitle: data.linearIssueTitle,
          isNewIssue: data.mode === "new",
          issueIdentifier: data.linearIssueIdentifier ?? undefined,
          estimate: data.requestedEstimate,
          estimatedAmount,
          dueDate: dueDate.toLocaleDateString("en-MY", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          note: data.note || undefined,
        }),
      });
    }
  } catch (emailError) {
    console.error(
      "Failed to send PPT request notification emails:",
      emailError,
    );
  }

  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard/admin");

  return { success: true, requestId: request.id };
}
