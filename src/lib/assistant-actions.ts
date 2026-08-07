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
import { buildAssistantPptPayoutPreview } from "@/lib/assistant-payout-preview";
import { actionPreview, assistantToolByName } from "@/lib/assistant-tools";
import type {
  AssistantPptPayoutPreview,
  AssistantPreview,
} from "@/lib/assistant-types";
import { hasAdminAccess } from "@/lib/authz";
import { syncBonusCandidatesForUser } from "@/lib/bonus";
import { TAGS } from "@/lib/cache-tags";
import {
  complexityLevelToLinearEstimate,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { withLinearFallback } from "@/lib/linear";
import {
  fetchIssuesByIds,
  findTodoWorkflowStateId,
} from "@/lib/linear-queries";
import { getCampaignBadgeFor } from "@/lib/payout-campaign-server";
import prisma from "@/lib/prisma";

type JsonRecord = Record<string, unknown>;

export type AssistantErrorCode =
  | "ISSUE_NOT_FOUND"
  | "TEAM_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "REAUTH_REQUIRED"
  | "VALIDATION_FAILED"
  | "TRANSIENT_ERROR";

export function classifyActionError(error: unknown): {
  code: AssistantErrorCode;
  message: string;
  isCorrectable: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/reauth|authentication|token/i.test(lower)) {
    return {
      code: "REAUTH_REQUIRED",
      message: "Your Linear authentication expired. Please re-authenticate.",
      isCorrectable: true,
    };
  }
  if (/permission|forbidden|unauthorized/i.test(lower)) {
    return {
      code: "PERMISSION_DENIED",
      message: "You do not have permission for this action.",
      isCorrectable: false,
    };
  }
  if (/project not found|selected project/i.test(lower)) {
    return {
      code: "PROJECT_NOT_FOUND",
      message: "The selected project was not found in Linear.",
      isCorrectable: true,
    };
  }
  if (/team not found|selected team/i.test(lower)) {
    return {
      code: "TEAM_NOT_FOUND",
      message: "The selected team was not found in Linear.",
      isCorrectable: true,
    };
  }
  if (/issue not found|task not found/i.test(lower)) {
    return {
      code: "ISSUE_NOT_FOUND",
      message: "The Linear task was not found.",
      isCorrectable: false,
    };
  }
  if (/invalid|choose a due date|required/i.test(lower)) {
    return {
      code: "VALIDATION_FAILED",
      message: message || "Validation failed.",
      isCorrectable: true,
    };
  }

  return {
    code: "TRANSIENT_ERROR",
    message: message || "The action could not be completed.",
    isCorrectable: true,
  };
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

async function reanchorDestination(
  client: Parameters<Parameters<typeof withLinearFallback>[1]>[0],
  payload: JsonRecord,
): Promise<{
  teamId: string;
  projectId: string | null;
  projectName: string | null;
}> {
  let teamId = payload.teamId ? String(payload.teamId) : null;
  const teamKey = payload.teamKey ? String(payload.teamKey) : null;
  const teamName = payload.teamName ? String(payload.teamName) : null;

  let projectId = payload.projectId ? String(payload.projectId) : null;
  const projectName = payload.projectName ? String(payload.projectName) : null;

  const teams = (await client.teams()).nodes;
  let team = teams.find((t) => t.id === teamId);

  if (!team && (teamKey || teamName)) {
    team = teams.find(
      (t) =>
        (teamKey && t.key.toLowerCase() === teamKey.toLowerCase()) ||
        (teamName && t.name.toLowerCase() === teamName.toLowerCase()),
    );
  }

  if (!team) {
    if (teams.length > 0) {
      team = teams[0];
    } else {
      throw new Error("The selected team was not found in Linear.");
    }
  }

  teamId = team.id;
  let resolvedProjectName: string | null = projectName;

  if (projectId || projectName) {
    const projects = (await team.projects()).nodes;
    let proj = projects.find((p) => p.id === projectId);
    if (!proj && projectName) {
      const matches = projects.filter(
        (p) => p.name.toLowerCase() === projectName.toLowerCase(),
      );
      if (matches.length === 1) {
        proj = matches[0];
      }
    }
    projectId = proj?.id ?? null;
    resolvedProjectName = proj?.name ?? projectName;
  }

  return { teamId, projectId, projectName: resolvedProjectName };
}

async function executeCreateTask(userId: string, payload: JsonRecord) {
  const dueDate = futureDate(payload.dueDate);
  return withLinearFallback(userId, async (client) => {
    const { teamId, projectId } = await reanchorDestination(client, payload);
    const stateId = await findTodoWorkflowStateId(client, teamId);
    const created = await client.createIssue({
      teamId,
      title: String(payload.title),
      ...(payload.description
        ? { description: String(payload.description) }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(stateId ? { stateId } : {}),
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

async function executeCreateBonusTask(userId: string, payload: JsonRecord) {
  const profile = await accessProfile(userId);
  if (!profile.linearId) {
    throw new Error("Your Linear account is not linked to DevHub.");
  }
  const dueDate = futureDate(payload.dueDate);
  const estimate = complexityLevelToLinearEstimate(
    Number(payload.estimate ?? 3),
  );

  const result = await withLinearFallback(userId, async (client) => {
    const { teamId, projectId } = await reanchorDestination(client, payload);
    const stateId = await findTodoWorkflowStateId(client, teamId);

    const created = await client.createIssue({
      teamId,
      title: String(payload.title),
      ...(payload.description
        ? { description: String(payload.description) }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(stateId ? { stateId } : {}),
      ...(estimate !== null ? { estimate } : {}),
      assigneeId: profile.linearId,
    });
    const issue = await created.issue;
    if (!issue) throw new Error("Linear did not return the created issue.");
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
    };
  });

  let syncNote = "Bonus-path task created and assigned to you.";
  try {
    await syncBonusCandidatesForUser(userId);
  } catch (syncError) {
    console.warn(
      `[assistant] bonus sync after issue creation failed for user ${userId}:`,
      syncError instanceof Error ? syncError.message : syncError,
    );
    syncNote = "Bonus-path task created; bonus tracking will sync shortly.";
  }

  return {
    success: true,
    issue: result,
    message: syncNote,
  };
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
  form.set("assigneeIntent", String(payload.assigneeIntent ?? "SELF"));

  if (payload.mode === "existing") {
    const anchored = await withLinearFallback(userId, async (client) => {
      const issueId = String(payload.linearIssueId ?? "");
      const [issueNode] = await fetchIssuesByIds(client, [issueId]);
      if (!issueNode) throw new Error("Task not found.");
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
    // New mode PPT request MUST NEVER perform an issue lookup.
    const anchored = await withLinearFallback(userId, async (client) => {
      const { teamId, projectId, projectName } = await reanchorDestination(
        client,
        payload,
      );
      return {
        teamId,
        projectId,
        projectName,
      };
    });
    form.set("linearIssueTitle", String(payload.title));
    form.set("linearTeamId", anchored.teamId);
    if (anchored.projectId) form.set("linearProjectId", anchored.projectId);
    if (anchored.projectName)
      form.set("linearProjectName", anchored.projectName);
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
  if (kind === "create_bonus_task")
    return executeCreateBonusTask(userId, payload);
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
        errorCode: null,
      },
    });
    try {
      revalidatePath("/dashboard/assistant");
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/ppts");
      revalidatePath("/dashboard/bonuses");
      revalidateTag(TAGS.workspacePpts, { expire: 0 });
    } catch (cacheError) {
      console.warn(
        "[assistant] action succeeded but cache refresh failed:",
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }
    return { success: true, result };
  } catch (error) {
    const classified = classifyActionError(error);

    if (classified.isCorrectable) {
      // Return to PENDING so user can correct inline in UI
      await prisma.assistantAction.update({
        where: { id: actionId },
        data: {
          status: "PENDING",
          error: classified.message,
          errorCode: classified.code,
        },
      });
      return {
        error: classified.message,
        errorCode: classified.code,
        isCorrectable: true,
      };
    }

    await prisma.assistantAction.update({
      where: { id: actionId },
      data: {
        status: "FAILED",
        error: classified.message,
        errorCode: classified.code,
        executedAt: new Date(),
      },
    });
    return { error: classified.message, errorCode: classified.code };
  }
}

export async function updateAssistantAction(
  actionId: string,
  userId: string,
  patch: JsonRecord,
) {
  const existing = await prisma.assistantAction.findFirst({
    where: { id: actionId, userId, conversation: { userId } },
  });
  if (!existing) return { error: "Action not found." };
  if (existing.status !== "PENDING") {
    return { error: "Only pending actions can be edited." };
  }

  const payload = { ...(existing.payload as JsonRecord), ...patch };
  const tool = assistantToolByName(`propose_${existing.kind}`);
  const parsed = tool?.schema.safeParse(payload);
  if (!tool || !parsed?.success) {
    return { error: "Invalid updated action values." };
  }

  const updatedPayload = parsed.data as JsonRecord;
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { developerRank: true, paymentMethod: true },
  });
  const currency = getCurrencyForPaymentMethod(profile?.paymentMethod ?? "MYR");

  let payout: AssistantPptPayoutPreview | undefined;
  if (existing.kind === "ppt_request") {
    const campaign = await getCampaignBadgeFor({
      scope: "PPT",
      userId,
      rank: profile?.developerRank ?? null,
    });
    payout = buildAssistantPptPayoutPreview(
      Number(updatedPayload.estimate ?? 3),
      currency,
      campaign,
    );
  }

  const preview = actionPreview(
    `propose_${existing.kind}`,
    updatedPayload,
    payout,
  );

  const updated = await prisma.assistantAction.update({
    where: { id: actionId },
    data: {
      payload: updatedPayload as Prisma.InputJsonValue,
      preview: preview as Prisma.InputJsonValue,
      error: null,
      errorCode: null,
    },
  });

  return {
    success: true,
    action: {
      id: updated.id,
      kind: updated.kind,
      payload: updated.payload,
      preview: updated.preview as AssistantPreview,
      status: updated.status,
      expiresAt: updated.expiresAt.toISOString(),
      executedAt: updated.executedAt ? updated.executedAt.toISOString() : null,
      result: updated.result,
      error: updated.error,
      errorCode: updated.errorCode,
    },
  };
}

export async function cancelAssistantAction(actionId: string, userId: string) {
  const cancelled = await prisma.assistantAction.updateMany({
    where: { id: actionId, userId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count !== 1) return { error: "Action is no longer pending." };
  return { success: true };
}
