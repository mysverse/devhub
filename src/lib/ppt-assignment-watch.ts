import type { LinearClient } from "@linear/sdk";
import type { PptAssignmentWatchStatus, Prisma } from "@prisma/client";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { linearEstimateToComplexityLevel } from "@/lib/currency";
import { getLinearServiceClient } from "@/lib/linear";
import { DEVHUB_PPT_ASSIGNMENT_WATCH_ISSUES_QUERY } from "@/lib/linear-documents";
import {
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notify,
  notifyWithPreferences,
} from "@/lib/notifications";
import {
  type AssignmentWatchSnapshot,
  deriveAssignmentActivity,
  getAssignmentWatchTiming,
} from "@/lib/ppt-assignment-watch-activity";
import prisma from "@/lib/prisma";

export const DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER =
  "<!-- devhub:ppt-assignment-watch -->";

type RawLinearClient = LinearClient & {
  client: {
    rawRequest<TData, TVariables extends Record<string, unknown> | undefined>(
      query: string,
      variables?: TVariables,
    ): Promise<{ data: TData }>;
  };
};

export type AssignmentWatchIssue = {
  id: string;
  identifier: string | null;
  title: string | null;
  url: string | null;
  description: string | null;
  estimate: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  state: { type: string | null; name: string | null };
  assignee: {
    id: string;
    email: string | null;
    name: string | null;
    displayName: string | null;
  };
  labels: string[];
  comments: {
    id: string;
    body: string;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date | null;
    editedAt: Date | null;
  }[];
  history: {
    actorId: string | null;
    toAssigneeId: string | null;
    fromAssigneeId: string | null;
    toStateId: string | null;
    fromStateId: string | null;
    createdAt: Date;
  }[];
};

type ExistingWatch = Prisma.PptAssignmentWatchGetPayload<{
  include: {
    user: { include: { user: { select: { email: true; name: true } } } };
  };
}>;

function coerceDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getWarningHours() {
  const configured = Number(process.env.PPT_HOGGING_WARNING_HOURS ?? "48");
  return Number.isFinite(configured) && configured > 0 ? configured : 48;
}

export function getUnassignHours() {
  const configured = Number(process.env.PPT_HOGGING_UNASSIGN_HOURS ?? "72");
  return Number.isFinite(configured) && configured > 0 ? configured : 72;
}

export function getSnoozeHours() {
  const configured = Number(process.env.PPT_HOGGING_SNOOZE_HOURS ?? "72");
  return Number.isFinite(configured) && configured > 0 ? configured : 72;
}

function parseSnapshot(
  value: Prisma.JsonValue | null,
): AssignmentWatchSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const assigneeLinearId = record.assigneeLinearId;
  if (typeof assigneeLinearId !== "string") return null;
  return {
    title: typeof record.title === "string" ? record.title : null,
    description:
      typeof record.description === "string" ? record.description : null,
    estimate: typeof record.estimate === "number" ? record.estimate : null,
    stateType: typeof record.stateType === "string" ? record.stateType : null,
    stateName: typeof record.stateName === "string" ? record.stateName : null,
    assigneeLinearId,
  };
}

function latestAssignmentAt(issue: AssignmentWatchIssue) {
  const latest = issue.history
    .filter((entry) => entry.toAssigneeId === issue.assignee.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return latest?.createdAt ?? issue.createdAt ?? issue.updatedAt ?? new Date();
}

async function rawRequest<TData>(
  client: LinearClient,
  query: string,
  variables: Record<string, unknown> = {},
) {
  const response = await (client as RawLinearClient).client.rawRequest<
    TData,
    Record<string, unknown>
  >(query, variables);
  if (!response.data) {
    throw new Error("Linear GraphQL response did not include data");
  }
  return response.data;
}

async function fetchAssignedPptIssues(client: LinearClient) {
  type RawIssue = {
    id: string;
    identifier?: string | null;
    title?: string | null;
    url?: string | null;
    description?: string | null;
    estimate?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    state?: { type?: string | null; name?: string | null } | null;
    assignee?: {
      id: string;
      email?: string | null;
      name?: string | null;
      displayName?: string | null;
    } | null;
    labels?: { nodes?: { name?: string | null }[] | null } | null;
    comments?: {
      nodes?:
        | {
            id: string;
            body?: string | null;
            user?: { id?: string | null } | null;
            createdAt?: string | null;
            updatedAt?: string | null;
            editedAt?: string | null;
          }[]
        | null;
    } | null;
    history?: {
      nodes?:
        | {
            actorId?: string | null;
            toAssigneeId?: string | null;
            fromAssigneeId?: string | null;
            toStateId?: string | null;
            fromStateId?: string | null;
            createdAt?: string | null;
          }[]
        | null;
    } | null;
  };

  const data = await rawRequest<{ issues: { nodes: RawIssue[] } }>(
    client,
    DEVHUB_PPT_ASSIGNMENT_WATCH_ISSUES_QUERY,
  );

  return data.issues.nodes.flatMap((issue): AssignmentWatchIssue[] => {
    if (!issue.assignee?.id) return [];
    return [
      {
        id: issue.id,
        identifier: issue.identifier ?? null,
        title: issue.title ?? null,
        url: issue.url ?? null,
        description: issue.description ?? null,
        estimate: linearEstimateToComplexityLevel(issue.estimate ?? null),
        createdAt: coerceDate(issue.createdAt),
        updatedAt: coerceDate(issue.updatedAt),
        state: {
          type: issue.state?.type ?? null,
          name: issue.state?.name ?? null,
        },
        assignee: {
          id: issue.assignee.id,
          email: issue.assignee.email ?? null,
          name: issue.assignee.name ?? null,
          displayName: issue.assignee.displayName ?? null,
        },
        labels: (issue.labels?.nodes ?? [])
          .map((label) => label.name?.trim())
          .filter((label): label is string => Boolean(label)),
        comments: (issue.comments?.nodes ?? []).flatMap((comment) => {
          const createdAt = coerceDate(comment.createdAt);
          if (!createdAt) return [];
          return [
            {
              id: comment.id,
              body: comment.body ?? "",
              userId: comment.user?.id ?? null,
              createdAt,
              updatedAt: coerceDate(comment.updatedAt),
              editedAt: coerceDate(comment.editedAt),
            },
          ];
        }),
        history: (issue.history?.nodes ?? []).flatMap((entry) => {
          const createdAt = coerceDate(entry.createdAt);
          if (!createdAt) return [];
          return [
            {
              actorId: entry.actorId ?? null,
              toAssigneeId: entry.toAssigneeId ?? null,
              fromAssigneeId: entry.fromAssigneeId ?? null,
              toStateId: entry.toStateId ?? null,
              fromStateId: entry.fromStateId ?? null,
              createdAt,
            },
          ];
        }),
      },
    ];
  });
}

async function findLinkedUser(issue: AssignmentWatchIssue) {
  return prisma.userProfile.findFirst({
    where: {
      OR: [
        { linearId: issue.assignee.id },
        ...(issue.assignee.email
          ? [
              {
                linearEmail: {
                  equals: issue.assignee.email,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    include: { user: { select: { email: true, name: true } } },
  });
}

function issueTitle(issue: AssignmentWatchIssue) {
  return issue.identifier
    ? `${issue.identifier} - ${issue.title ?? "PPT task"}`
    : (issue.title ?? "PPT task");
}

function warningComment(issue: AssignmentWatchIssue, staleHours: number) {
  return `${DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER}
DevHub assignment warning: this PPT has been assigned to ${
    issue.assignee.displayName ?? issue.assignee.name ?? "a developer"
  } for ${Math.floor(staleHours)} hours without visible activity. Please post progress or unassign yourself if you are not actively working on it.`;
}

function unassignComment(staleHours: number) {
  return `${DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER}
DevHub automatically unassigned this PPT after ${Math.floor(staleHours)} hours without visible activity so another developer can claim it.`;
}

async function commentIfPossible(
  client: LinearClient,
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
  type: "warning" | "unassigned",
  staleHours: number,
) {
  if (
    watch.lastLinearCommentType === type &&
    watch.lastLinearCommentAt &&
    Date.now() - watch.lastLinearCommentAt.getTime() < 6 * 60 * 60 * 1000
  ) {
    return;
  }

  await client.createComment({
    issueId: issue.id,
    body:
      type === "warning"
        ? warningComment(issue, staleHours)
        : unassignComment(staleHours),
  });
  await prisma.pptAssignmentWatch.update({
    where: { id: watch.id },
    data: {
      lastLinearCommentAt: new Date(),
      lastLinearCommentType: type,
    },
  });
}

async function notifyAssigneeWarning(
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
) {
  if (!watch.userId) return;
  await notifyWithPreferences({
    userId: watch.userId,
    domain: "ppt_task",
    type: "STALE_WARNING",
    title: `PPT activity needed: ${issue.identifier ?? issue.title ?? "task"}`,
    message:
      "Post a progress update or unassign yourself if you are not actively working on this PPT.",
    href: "/dashboard/ppts",
    entityType: "linear_issue",
    entityId: issue.id,
    payload: { issueId: issue.id, issueUrl: issue.url },
    dedupeKey: `ppt-task:stale-warning:${watch.id}:${watch.warningCount + 1}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: watch.user?.user.email
      ? {
          to: watch.user.user.email,
          subject: `PPT activity needed: ${issueTitle(issue)}`,
          category: "ppt_task_stale_warning",
          idempotencyKey: `ppt-task:stale-warning:${watch.id}:${watch.warningCount + 1}`,
        }
      : undefined,
  });
}

async function notifyAssigneeUnassigned(
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
) {
  if (!watch.userId) return;
  await notifyWithPreferences({
    userId: watch.userId,
    domain: "ppt_task",
    type: "AUTO_UNASSIGNED",
    title: `PPT unassigned: ${issue.identifier ?? issue.title ?? "task"}`,
    message:
      "DevHub unassigned this PPT after the stale assignment window passed without visible activity.",
    href: "/dashboard/ppts",
    entityType: "linear_issue",
    entityId: issue.id,
    payload: { issueId: issue.id, issueUrl: issue.url },
    dedupeKey: `ppt-task:auto-unassigned:${watch.id}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: watch.user?.user.email
      ? {
          to: watch.user.user.email,
          subject: `PPT automatically unassigned: ${issueTitle(issue)}`,
          category: "ppt_task_auto_unassigned",
          idempotencyKey: `ppt-task:auto-unassigned:${watch.id}`,
        }
      : undefined,
  });
}

async function notifyAdminsUnassigned(
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
) {
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) =>
      notify({
        userId: admin.id,
        domain: "admin_notice",
        type: "PPT_AUTO_UNASSIGNED",
        title: `PPT auto-unassigned: ${issue.identifier ?? issue.title ?? "task"}`,
        message: `${watch.assigneeName ?? "A developer"} was unassigned from ${issueTitle(issue)} after stale assignment checks.`,
        href: "/dashboard/admin",
        entityType: "linear_issue",
        entityId: issue.id,
        dedupeKey: `ppt-task:auto-unassigned:admin:${admin.id}:${watch.id}`,
        channels: [IN_APP_CHANNEL],
      }),
    ),
  );
}

async function upsertWatch(issue: AssignmentWatchIssue) {
  const user = await findLinkedUser(issue);
  const assignedAt = latestAssignmentAt(issue);
  const existing = await prisma.pptAssignmentWatch.findUnique({
    where: {
      linearIssueId_assigneeLinearId: {
        linearIssueId: issue.id,
        assigneeLinearId: issue.assignee.id,
      },
    },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  const activity = deriveAssignmentActivity({
    issue,
    assignedAt,
    previousLastActivityAt: existing?.lastActivityAt,
    previousSnapshot: parseSnapshot(existing?.metadata ?? null),
  });
  const baseData = {
    linearIssueIdentifier: issue.identifier,
    linearIssueTitle: issue.title,
    linearIssueUrl: issue.url,
    assigneeEmail: issue.assignee.email,
    assigneeName: issue.assignee.displayName ?? issue.assignee.name,
    userId: user?.id ?? null,
    assignedAt,
    lastActivityAt: activity.lastActivityAt,
    metadata: activity.snapshot as unknown as Prisma.InputJsonValue,
  };

  if (!existing) {
    return prisma.pptAssignmentWatch.create({
      data: {
        linearIssueId: issue.id,
        assigneeLinearId: issue.assignee.id,
        ...baseData,
      },
      include: {
        user: { include: { user: { select: { email: true, name: true } } } },
      },
    });
  }

  return prisma.pptAssignmentWatch.update({
    where: { id: existing.id },
    data: {
      ...baseData,
      ...(activity.changed
        ? {
            status: "ACTIVE" as PptAssignmentWatchStatus,
            warnedAt: null,
            snoozedUntil: null,
            snoozeReason: null,
          }
        : {}),
    },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
    },
  });
}

async function warnIfNeeded(
  client: LinearClient,
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
  staleHours: number,
) {
  if (watch.warnedAt) return false;
  await notifyAssigneeWarning(watch, issue);
  await commentIfPossible(client, watch, issue, "warning", staleHours);
  await prisma.pptAssignmentWatch.update({
    where: { id: watch.id },
    data: {
      status: "WARNED",
      warnedAt: new Date(),
      warningCount: { increment: 1 },
    },
  });
  return true;
}

async function unassignIfNeeded(
  client: LinearClient,
  watch: ExistingWatch,
  issue: AssignmentWatchIssue,
  staleHours: number,
) {
  if (watch.status === "UNASSIGNED") return false;
  await client.updateIssue(issue.id, { assigneeId: null });
  await commentIfPossible(client, watch, issue, "unassigned", staleHours);
  await notifyAssigneeUnassigned(watch, issue);
  await notifyAdminsUnassigned(watch, issue);
  await prisma.pptAssignmentWatch.update({
    where: { id: watch.id },
    data: { status: "UNASSIGNED", unassignedAt: new Date() },
  });
  return true;
}

async function resolveInactiveWatches(activeKeys: Set<string>) {
  const open = await prisma.pptAssignmentWatch.findMany({
    where: { status: { in: ["ACTIVE", "WARNED", "SNOOZED"] } },
    select: { id: true, linearIssueId: true, assigneeLinearId: true },
  });
  let resolved = 0;
  for (const watch of open) {
    const key = `${watch.linearIssueId}:${watch.assigneeLinearId}`;
    if (activeKeys.has(key)) continue;
    await prisma.pptAssignmentWatch.update({
      where: { id: watch.id },
      data: { status: "RESOLVED" },
    });
    resolved++;
  }
  return resolved;
}

export async function runPptAssignmentWatch() {
  const client = getLinearServiceClient();
  if (!client) {
    throw new Error(
      "LINEAR_SERVICE_API_KEY is required for PPT assignment watch",
    );
  }

  const now = new Date();
  const warningHours = getWarningHours();
  const unassignHours = getUnassignHours();
  const issues = await fetchAssignedPptIssues(client);
  const activeKeys = new Set<string>();
  let checked = 0;
  let warned = 0;
  let unassigned = 0;

  for (const issue of issues) {
    const key = `${issue.id}:${issue.assignee.id}`;
    activeKeys.add(key);
    const watch = await upsertWatch(issue);
    checked++;

    const timing = getAssignmentWatchTiming({
      lastActivityAt: watch.lastActivityAt,
      status: watch.status,
      snoozedUntil: watch.snoozedUntil,
      now,
      warningHours,
      unassignHours,
    });
    if (timing.isSnoozed) continue;

    const staleHours = timing.staleHours;
    if (staleHours >= unassignHours) {
      if (await unassignIfNeeded(client, watch, issue, staleHours)) {
        unassigned++;
      }
      continue;
    }
    if (staleHours >= warningHours) {
      if (await warnIfNeeded(client, watch, issue, staleHours)) warned++;
    }
  }

  const resolved = await resolveInactiveWatches(activeKeys);
  return {
    checked,
    warned,
    unassigned,
    resolved,
    discord: { sent: 0, skipped: true },
  };
}
