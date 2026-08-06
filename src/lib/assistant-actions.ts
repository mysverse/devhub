import type { PptSelfBlockReason, Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { POST as submitPptRequestRoute } from "@/app/api/ppt-requests/route";
import {
  claimIssue,
  markTaskBlocked,
  releaseIssue,
} from "@/app/dashboard/actions";
import { suggestTaskToDeveloper } from "@/app/dashboard/admin/task-suggestion-actions";
import {
  submitPptProgress,
  submitPptProof,
} from "@/app/dashboard/ppts/actions";
import { assistantToolByName } from "@/lib/assistant-tools";
import { hasAdminAccess } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { withLinearFallback } from "@/lib/linear";
import {
  fetchIssuesByIds,
  findTodoWorkflowStateId,
} from "@/lib/linear-queries";
import prisma from "@/lib/prisma";

type JsonRecord = Record<string, unknown>;

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission|forbidden|unauthorized/i.test(message)) {
    return "You no longer have permission for this action.";
  }
  if (/not found|does not exist/i.test(message)) {
    return "The task no longer exists.";
  }
  return message || "The action could not be completed.";
}

function futureDate(value: unknown, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("Choose a due date before confirming.");
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("The due date is invalid.");
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date < tomorrow) throw new Error("The due date must be in the future.");
  return date.toISOString().slice(0, 10);
}

async function accessProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true, developerRank: true, linearId: true },
  });
  if (!profile) throw new Error("Profile not found.");
  return { ...profile, admin: hasAdminAccess(profile) };
}

async function executeCreateTask(userId: string, payload: JsonRecord) {
  const dueDate = futureDate(payload.dueDate);
  return withLinearFallback(userId, async (client) => {
    const teamId = String(payload.teamId);
    const stateId = await findTodoWorkflowStateId(client, teamId);
    const created = await client.createIssue({
      teamId,
      title: String(payload.title),
      ...(payload.description
        ? { description: String(payload.description) }
        : {}),
      ...(payload.projectId ? { projectId: String(payload.projectId) } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(stateId ? { stateId } : {}),
      // Ordinary issue only. Labels and estimates are deliberately absent.
    });
    const issue = await created.issue;
    if (!issue) throw new Error("Linear did not return the created issue.");
    return {
      success: true,
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      },
      message: "Ordinary Linear issue created. It is not a PPT.",
    };
  });
}

async function withGuardedIssue<Result>(
  userId: string,
  issueId: string,
  callback: (
    client: Parameters<Parameters<typeof withLinearFallback>[1]>[0],
    issue: Awaited<ReturnType<typeof fetchIssuesByIds>>[number],
  ) => Promise<Result>,
) {
  const profile = await accessProfile(userId);
  return withLinearFallback(userId, async (client) => {
    const viewer = await client.viewer;
    const [issue] = await fetchIssuesByIds(client, [issueId]);
    if (!issue) throw new Error("Task not found.");
    if (issue.labelNames.some((label) => label.toUpperCase() === "PPT")) {
      throw new Error("PPT tasks cannot be edited through the assistant.");
    }
    if (["completed", "canceled"].includes(issue.stateType)) {
      throw new Error("Completed or cancelled tasks cannot be changed here.");
    }
    if (!profile.admin && issue.assignee?.id !== viewer.id) {
      throw new Error("You can only edit an ordinary task assigned to you.");
    }
    return callback(client, issue);
  });
}

async function executeUpdateTask(userId: string, payload: JsonRecord) {
  const issueId = String(payload.issueId);
  const dueDate = futureDate(payload.dueDate);
  return withGuardedIssue(userId, issueId, async (client, issue) => {
    const input: Record<string, unknown> = {};
    if (payload.title) input.title = String(payload.title);
    if (payload.description) input.description = String(payload.description);
    if (payload.projectId) input.projectId = String(payload.projectId);
    if (dueDate) input.dueDate = dueDate;
    if (Object.keys(input).length === 0) {
      throw new Error("No safe task fields were selected for update.");
    }
    await client.updateIssue(issueId, input);
    return {
      success: true,
      issue: { id: issue.id, identifier: issue.identifier, title: issue.title },
      message: "Task updated.",
    };
  });
}

async function executeComment(userId: string, payload: JsonRecord) {
  const issueId = String(payload.issueId);
  return withGuardedIssue(userId, issueId, async (client, issue) => {
    await client.createComment({ issueId, body: String(payload.body) });
    return {
      success: true,
      issue: { id: issue.id, identifier: issue.identifier, title: issue.title },
      message: "Comment posted.",
    };
  });
}

async function executeAssign(userId: string, payload: JsonRecord) {
  const profile = await accessProfile(userId);
  if (!profile.admin) throw new Error("Admin access is required.");
  const issueId = String(payload.issueId);
  const assigneeLinearId = payload.assigneeLinearId
    ? String(payload.assigneeLinearId)
    : null;
  if (assigneeLinearId) {
    const assignee = await prisma.userProfile.findUnique({
      where: { linearId: assigneeLinearId },
      select: { id: true },
    });
    if (!assignee) throw new Error("That assignee is not a DevHub developer.");
  }
  return withGuardedIssue(userId, issueId, async (client, issue) => {
    await client.updateIssue(issueId, { assigneeId: assigneeLinearId });
    return {
      success: true,
      issue: { id: issue.id, identifier: issue.identifier, title: issue.title },
      message: payload.assigneeLinearId ? "Task assigned." : "Task unassigned.",
    };
  });
}

async function executePptRequest(userId: string, payload: JsonRecord) {
  const dueDate = futureDate(payload.dueDate, true);
  const form = new FormData();
  form.set("mode", String(payload.mode));
  form.set("requestedEstimate", String(payload.estimate));
  form.set("projectedDueDate", new Date(String(dueDate)).toISOString());
  form.set(
    "description",
    payload.description ? String(payload.description) : "",
  );
  form.set("note", payload.note ? String(payload.note) : "");
  form.set("assigneeIntent", String(payload.assigneeIntent));

  if (payload.mode === "existing") {
    const anchored = await withLinearFallback(userId, async (client) => {
      const issueId = String(payload.linearIssueId ?? "");
      const issue = await client.issue(issueId);
      const team = await issue.team;
      const project = await issue.project;
      if (!team) throw new Error("The Linear issue has no team.");
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        teamId: team.id,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
      };
    });
    form.set("linearIssueId", anchored.id);
    form.set("linearIssueIdentifier", anchored.identifier);
    form.set("linearIssueUrl", anchored.url);
    form.set("linearIssueTitle", anchored.title);
    form.set("linearTeamId", anchored.teamId);
    if (anchored.projectId) form.set("linearProjectId", anchored.projectId);
    if (anchored.projectName)
      form.set("linearProjectName", anchored.projectName);
  } else {
    const anchored = await withLinearFallback(userId, async (client) => {
      const team = await client.team(String(payload.teamId));
      const projectId = payload.projectId ? String(payload.projectId) : null;
      if (!projectId) return { teamId: team.id, project: null };
      const projects = await team.projects();
      const project = projects.nodes.find((item) => item.id === projectId);
      if (!project) {
        throw new Error("The selected project does not belong to that team.");
      }
      return {
        teamId: team.id,
        project: { id: project.id, name: project.name },
      };
    });
    form.set("linearIssueTitle", String(payload.title));
    form.set("linearTeamId", anchored.teamId);
    if (anchored.project) {
      form.set("linearProjectId", anchored.project.id);
      form.set("linearProjectName", anchored.project.name);
    }
  }

  const request = new Request("http://devhub.local/api/ppt-requests", {
    method: "POST",
    body: form,
  });
  const response = await submitPptRequestRoute(request);
  const result = (await response.json()) as {
    error?: string;
    requestId?: string;
  };
  if (!response.ok || result.error) {
    throw new Error(result.error ?? "PPT request could not be submitted.");
  }
  return {
    success: true,
    requestId: result.requestId,
    message: "PPT request submitted for admin review.",
  };
}

async function executeKind(kind: string, userId: string, payload: JsonRecord) {
  if (kind === "create_task") return executeCreateTask(userId, payload);
  if (kind === "update_task") return executeUpdateTask(userId, payload);
  if (kind === "comment") return executeComment(userId, payload);
  if (kind === "assign_task") return executeAssign(userId, payload);
  if (kind === "ppt_request") return executePptRequest(userId, payload);
  if (kind === "claim_task") {
    return claimIssue(String(payload.issueId));
  }
  if (kind === "release_task") {
    return releaseIssue(String(payload.issueId));
  }
  if (kind === "block_task") {
    return markTaskBlocked(
      String(payload.issueId),
      String(payload.reason) as PptSelfBlockReason,
      payload.note ? String(payload.note) : undefined,
    );
  }
  if (kind === "progress") {
    return submitPptProgress(String(payload.issueId), String(payload.body));
  }
  if (kind === "proof") {
    return submitPptProof(String(payload.issueId), String(payload.body));
  }
  if (kind === "task_suggestion") {
    return suggestTaskToDeveloper({
      issueId: String(payload.issueId),
      userId: String(payload.developerId),
      note: payload.note ? String(payload.note) : undefined,
    });
  }
  throw new Error("This assistant action is not supported.");
}

export async function confirmAssistantAction(actionId: string, userId: string) {
  const existing = await prisma.assistantAction.findFirst({
    where: { id: actionId, userId, conversation: { userId } },
  });
  if (!existing) return { error: "Action not found." };
  if (existing.status === "SUCCEEDED") {
    return { success: true, result: existing.result };
  }
  if (existing.status !== "PENDING") {
    return {
      error: `This action is already ${existing.status.toLowerCase()}.`,
    };
  }
  if (existing.expiresAt <= new Date()) {
    await prisma.assistantAction.updateMany({
      where: { id: actionId, userId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return {
      error: "This action expired. Ask the assistant to prepare it again.",
    };
  }

  const tool = assistantToolByName(`propose_${existing.kind}`);
  const parsed = tool?.schema.safeParse(existing.payload);
  if (!tool || !parsed?.success)
    return { error: "The saved action is invalid." };

  const claimed = await prisma.assistantAction.updateMany({
    where: {
      id: actionId,
      userId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    data: { status: "EXECUTING" },
  });
  if (claimed.count !== 1) {
    return { error: "This action is already being handled." };
  }

  try {
    const result = await executeKind(
      existing.kind,
      userId,
      parsed.data as JsonRecord,
    );
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error
    ) {
      throw new Error(String(result.error));
    }
    await prisma.assistantAction.update({
      where: { id: actionId },
      data: {
        status: "SUCCEEDED",
        executedAt: new Date(),
        result: result as Prisma.InputJsonValue,
        error: null,
      },
    });
    try {
      revalidatePath("/dashboard/assistant");
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/ppts");
      revalidateTag(TAGS.workspacePpts, { expire: 0 });
    } catch (cacheError) {
      // The mutation is already committed and the action is already marked
      // successful. Cache invalidation must never rewrite that truth.
      console.warn(
        "[assistant] action succeeded but cache refresh failed:",
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }
    return { success: true, result };
  } catch (error) {
    const message = publicError(error);
    await prisma.assistantAction.update({
      where: { id: actionId },
      data: { status: "FAILED", error: message, executedAt: new Date() },
    });
    return { error: message };
  }
}

export async function cancelAssistantAction(actionId: string, userId: string) {
  const cancelled = await prisma.assistantAction.updateMany({
    where: { id: actionId, userId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count !== 1) return { error: "Action is no longer pending." };
  return { success: true };
}
