import type { LinearClient } from "@linear/sdk";
import type {
  PptAssignmentWatchStatus,
  PptWatchEventType,
  Prisma,
} from "@prisma/client";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { linearEstimateToComplexityLevel } from "@/lib/currency";
import { resolveDisplayName } from "@/lib/display-name";
import { runBatch, runFollowUps } from "@/lib/fault-isolation";
import { getLinearServiceClient } from "@/lib/linear";
import { DEVHUB_PPT_ASSIGNMENT_WATCH_ISSUES_QUERY } from "@/lib/linear-documents";
import {
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notify,
  notifyWithPreferences,
} from "@/lib/notifications";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import {
  type AssignmentWatchSnapshot,
  deriveAssignmentActivity,
  getAssignmentWatchTiming,
} from "@/lib/ppt-assignment-watch-activity";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

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

/**
 * Append to the watch audit trail. Best-effort — an audit failure must never
 * break the claim/release/cron flow it decorates.
 */
export async function appendWatchEvent(input: {
  watchId: string;
  linearIssueId: string;
  type: PptWatchEventType;
  actorUserId?: string | null;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.pptAssignmentWatchEvent.create({
      data: {
        watchId: input.watchId,
        linearIssueId: input.linearIssueId,
        type: input.type,
        actorUserId: input.actorUserId ?? null,
        note: input.note ?? null,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("[ppt-assignment-watch] Failed to append event:", error);
  }
}

export function getWarningHours() {
  return getResolvedPayoutPolicy().warnHours;
}

export function getUnassignHours() {
  return getResolvedPayoutPolicy().unassignHours;
}

export function getSnoozeHours() {
  return getResolvedPayoutPolicy().snoozeHours;
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
    include: { user: { select: USER_IDENTITY_SELECT } },
  });
}

function issueTitle(issue: AssignmentWatchIssue) {
  return issue.identifier
    ? `${issue.identifier} - ${issue.title ?? "PPT task"}`
    : (issue.title ?? "PPT task");
}

// Addressed to the assignee in the second person rather than naming them:
// publicly tagging someone as inactive on a workspace-visible issue is the
// harm, whichever name is used. Linear already shows who the assignee is.
function warningComment(staleHours: number) {
  return `${DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER}
DevHub activity reminder: this PPT has had no visible activity for ${Math.floor(
    staleHours,
  )} hours. A quick progress note resets the timer. Waiting on something? Mark the task blocked in DevHub. After ${getUnassignHours()} hours without activity the task returns to the board (the standard rule for every task).`;
}

function unassignComment(staleHours: number) {
  return `${DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER}
DevHub returned this PPT to the board after ${Math.floor(
    staleHours,
  )} hours without visible activity — the standard rule for every task, so work never gets stuck. It is open again for anyone (including the previous assignee) to claim.`;
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
        ? warningComment(staleHours)
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
    title: `PPT activity reminder: ${issue.identifier ?? issue.title ?? "task"}`,
    message: `No visible activity for ${getWarningHours()} hours. A quick progress note keeps the task yours; if you're waiting on someone, mark it blocked; or release it back to the board — all from your task card.`,
    href: `/dashboard/ppts#task-${issue.id}`,
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
    title: `PPT returned to board: ${issue.identifier ?? issue.title ?? "task"}`,
    message: `This task went back to the board after ${getUnassignHours()} hours without activity — that's the standard rule for every task, nothing personal. It's still open: reclaim it from the board any time.`,
    href: `/dashboard/ppts#task-${issue.id}`,
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
        message: `${resolveDisplayName({
          profile: watch.user,
          storedLinearName: watch.assigneeName,
          fallback: "A developer",
        })} was unassigned from ${issueTitle(issue)} after stale assignment checks.`,
        href: "/dashboard/admin",
        entityType: "linear_issue",
        entityId: issue.id,
        dedupeKey: `ppt-task:auto-unassigned:admin:${admin.id}:${watch.id}`,
        channels: [IN_APP_CHANNEL],
      }),
    ),
  );
}

export type EagerClaimIssue = {
  id: string;
  identifier: string | null;
  title: string | null;
  url: string | null;
};

/**
 * Record a claim the moment it happens so the activity countdown is visible
 * immediately instead of after the next hourly cron. Resets self-block and
 * warning state for the fresh assignment; the cron's upsertWatch reconciles
 * full issue data later. Best-effort: a failure here must not fail the claim.
 */
export async function recordEagerClaim({
  issue,
  userId,
  assigneeLinearId,
  takeover,
}: {
  issue: EagerClaimIssue;
  userId: string;
  assigneeLinearId: string;
  takeover?: {
    reason: string;
    previousAssigneeLinearId: string;
  } | null;
}) {
  try {
    const now = new Date();
    const watch = await prisma.pptAssignmentWatch.upsert({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issue.id,
          assigneeLinearId,
        },
      },
      create: {
        linearIssueId: issue.id,
        assigneeLinearId,
        linearIssueIdentifier: issue.identifier,
        linearIssueTitle: issue.title,
        linearIssueUrl: issue.url,
        userId,
        assignedAt: now,
        lastActivityAt: now,
        reassignedFromLinearId: takeover?.previousAssigneeLinearId ?? null,
        reassignReason: takeover?.reason ?? null,
      },
      update: {
        linearIssueIdentifier: issue.identifier,
        linearIssueTitle: issue.title,
        linearIssueUrl: issue.url,
        userId,
        assignedAt: now,
        lastActivityAt: now,
        status: "ACTIVE",
        warnedAt: null,
        warningCount: 0,
        snoozedUntil: null,
        snoozeReason: null,
        unassignedAt: null,
        selfBlockedAt: null,
        selfBlockReason: null,
        selfBlockNote: null,
        selfBlockExpiresAt: null,
        selfBlockCount: 0,
        idleNudgedAt: null,
        releasedBySelfAt: null,
        reassignedFromLinearId: takeover?.previousAssigneeLinearId ?? null,
        reassignReason: takeover?.reason ?? null,
      },
    });
    await appendWatchEvent({
      watchId: watch.id,
      linearIssueId: issue.id,
      type: takeover ? "REASSIGNED_TAKEN" : "CLAIMED",
      actorUserId: userId,
      note: takeover?.reason ?? null,
    });
    return watch;
  } catch (error) {
    console.error("[ppt-assignment-watch] Failed to record claim:", error);
    return null;
  }
}

/**
 * Close out the previous assignee's watch after a takeover and tell them what
 * happened, including the taker's required reason. Best-effort.
 */
export async function recordTakeoverAway({
  issue,
  previousAssigneeLinearId,
  takenByUserId,
  takenByName,
  reason,
}: {
  issue: EagerClaimIssue;
  previousAssigneeLinearId: string;
  takenByUserId: string;
  takenByName: string;
  reason: string;
}) {
  try {
    const watch = await prisma.pptAssignmentWatch.findUnique({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issue.id,
          assigneeLinearId: previousAssigneeLinearId,
        },
      },
      include: {
        user: { include: { user: { select: USER_IDENTITY_SELECT } } },
      },
    });
    if (!watch) return;

    await prisma.pptAssignmentWatch.update({
      where: { id: watch.id },
      data: { status: "RESOLVED" },
    });
    await appendWatchEvent({
      watchId: watch.id,
      linearIssueId: issue.id,
      type: "REASSIGNED_AWAY",
      actorUserId: takenByUserId,
      note: reason,
    });

    if (!watch.userId) return;
    const label = issue.identifier ?? issue.title ?? "a PPT task";
    await notifyWithPreferences({
      userId: watch.userId,
      actorId: takenByUserId,
      domain: "ppt_task",
      type: "REASSIGNED_AWAY",
      title: `Task taken over: ${label}`,
      message: `${takenByName} took over ${issue.title ?? label}. Their note: "${reason}". Your completed work stays credited to you — reach out to an admin if this takeover seems wrong.`,
      href: "/dashboard/ppts",
      entityType: "linear_issue",
      entityId: issue.id,
      payload: { issueId: issue.id, issueUrl: issue.url, reason },
      dedupeKey: `ppt-task:reassigned-away:${watch.id}:${takenByUserId}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: watch.user?.user.email
        ? {
            to: watch.user.user.email,
            subject: `Your PPT task was taken over: ${label}`,
            category: "ppt_task_reassigned_away",
            idempotencyKey: `ppt-task:reassigned-away:${watch.id}:${takenByUserId}`,
          }
        : undefined,
    });
  } catch (error) {
    console.error("[ppt-assignment-watch] Failed to record takeover:", error);
  }
}

/**
 * Broadcast a newly-available task (released or auto-unassigned) to developers
 * with capacity — fewer than 2 active claimed tasks — excluding the developer
 * who just held it. In-app only; the notification engine dedupes repeats.
 */
export async function broadcastTaskAvailable({
  issue,
  excludeUserId,
  context,
}: {
  issue: EagerClaimIssue;
  excludeUserId?: string | null;
  context: "released" | "auto_unassigned";
}) {
  const developers = await prisma.userProfile.findMany({
    where: {
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      linearId: { not: null },
      role: "DEVELOPER",
    },
    select: { id: true },
  });
  if (developers.length === 0) return;

  const activeCounts = await prisma.pptAssignmentWatch.groupBy({
    by: ["userId"],
    where: {
      userId: { in: developers.map((dev) => dev.id) },
      status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"] },
    },
    _count: { _all: true },
  });
  const countByUser = new Map(
    activeCounts.map((row) => [row.userId, row._count._all]),
  );

  const label = issue.identifier ?? issue.title ?? "A PPT task";
  for (const dev of developers) {
    if ((countByUser.get(dev.id) ?? 0) >= 2) continue;
    await notifyWithPreferences({
      userId: dev.id,
      domain: "ppt_task",
      type: "UNCLAIMED_AVAILABLE",
      title: `PPT back on the board: ${label}`,
      message:
        context === "released"
          ? `${issue.title ?? label} was freed up and is open to claim.`
          : `${issue.title ?? label} returned to the board and is open to claim.`,
      href: "/dashboard/ppts",
      entityType: "linear_issue",
      entityId: issue.id,
      payload: { issueId: issue.id, issueUrl: issue.url, context },
      dedupeKey: `ppt-task:available:${dev.id}:${issue.id}`,
      channels: [IN_APP_CHANNEL],
    });
  }
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
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
        user: { include: { user: { select: USER_IDENTITY_SELECT } } },
      },
    });
  }

  return prisma.pptAssignmentWatch.update({
    where: { id: existing.id },
    data: {
      ...baseData,
      ...(activity.changed
        ? {
            // Real activity clears every paused/warned state, including a
            // self-block — the developer is evidently unblocked.
            status: "ACTIVE" as PptAssignmentWatchStatus,
            warnedAt: null,
            snoozedUntil: null,
            snoozeReason: null,
            selfBlockedAt: null,
            selfBlockReason: null,
            selfBlockNote: null,
            selfBlockExpiresAt: null,
            idleNudgedAt: null,
          }
        : {}),
    },
    include: {
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
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
  await appendWatchEvent({
    watchId: watch.id,
    linearIssueId: issue.id,
    type: "WARNED",
    metadata: { staleHours: Math.floor(staleHours) },
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

  // The only irreversible step, and the only one whose failure means nothing
  // happened. If it throws, the caller's per-issue guard logs it and the next
  // run tries again — the developer keeps their task in the meantime.
  await client.updateIssue(issue.id, { assigneeId: null });

  // Past here the developer has already lost the task in Linear. These were
  // six bare awaits, so a transient failure on the FIRST of them — a courtesy
  // comment — meant the developer was never notified, DevHub never recorded
  // the unassignment, and the task was never offered to anyone else. Someone
  // lost a paid task silently.
  //
  // Ordered by what costs the most to lose: telling the developer comes before
  // the Linear comment, and recording the state comes before the broadcast.
  await runFollowUps("ppt-auto-unassign", [
    {
      name: "notify-developer",
      run: () => notifyAssigneeUnassigned(watch, issue),
    },
    {
      name: "watch-status",
      run: () =>
        prisma.pptAssignmentWatch.update({
          where: { id: watch.id },
          data: { status: "UNASSIGNED", unassignedAt: new Date() },
        }),
    },
    {
      name: "watch-event",
      run: () =>
        appendWatchEvent({
          watchId: watch.id,
          linearIssueId: issue.id,
          type: "AUTO_UNASSIGNED",
          metadata: { staleHours: Math.floor(staleHours) },
        }),
    },
    {
      name: "notify-admins",
      run: () => notifyAdminsUnassigned(watch, issue),
    },
    {
      name: "linear-comment",
      run: () =>
        commentIfPossible(client, watch, issue, "unassigned", staleHours),
    },
    {
      name: "broadcast-available",
      run: () =>
        broadcastTaskAvailable({
          issue: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          },
          excludeUserId: watch.userId,
          context: "auto_unassigned",
        }),
    },
  ]);

  return true;
}

/** Bounded so one very large workspace cannot make this query the next thing
 *  that exceeds an Accelerate worker's limits. */
const RESOLVE_SCAN_LIMIT = 500;

async function resolveInactiveWatches(activeKeys: Set<string>) {
  const open = await prisma.pptAssignmentWatch.findMany({
    where: { status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"] } },
    select: { id: true, linearIssueId: true, assigneeLinearId: true },
    orderBy: { updatedAt: "asc" },
    take: RESOLVE_SCAN_LIMIT,
  });

  const stale = open.filter(
    (watch) =>
      !activeKeys.has(`${watch.linearIssueId}:${watch.assigneeLinearId}`),
  );

  const batch = await runBatch({
    label: "ppt-watch-resolve-inactive",
    items: stale,
    scanLimit:
      open.length >= RESOLVE_SCAN_LIMIT ? RESOLVE_SCAN_LIMIT : undefined,
    identify: (watch) => watch.id,
    run: async (watch) => {
      await prisma.pptAssignmentWatch.update({
        where: { id: watch.id },
        data: { status: "RESOLVED" },
      });
    },
  });

  return batch.succeeded;
}

export async function runPptAssignmentWatch() {
  const client = getLinearServiceClient();
  if (!client) {
    throw new Error(
      "LINEAR_SERVICE_API_KEY is required for PPT assignment watch",
    );
  }

  const now = new Date();
  const policy = getResolvedPayoutPolicy();
  const warningHours = policy.warnHours;
  const unassignHours = policy.unassignHours;
  const issues = await fetchAssignedPptIssues(client);
  const activeKeys = new Set<string>();
  let checked = 0;
  let warned = 0;
  let unassigned = 0;
  let nudged = 0;
  let blockExpired = 0;
  let failed = 0;

  for (const issue of issues) {
    // Recorded before anything that can fail. resolveInactiveWatches() marks
    // every watch NOT in this set as RESOLVED, so an issue whose processing
    // throws must still count as seen — otherwise one transient failure
    // silently closes a live assignment.
    const key = `${issue.id}:${issue.assignee.id}`;
    activeKeys.add(key);

    // Per-issue isolation, mirroring the shape data-retention already uses:
    // this cron unassigns developers from paid tasks, and one bad row used to
    // abort the entire run — leaving every issue after it unchecked, with no
    // record that they were skipped.
    try {
      const watch = await upsertWatch(issue);
      checked++;

      const timing = getAssignmentWatchTiming({
        lastActivityAt: watch.lastActivityAt,
        status: watch.status,
        snoozedUntil: watch.snoozedUntil,
        selfBlockExpiresAt: watch.selfBlockExpiresAt,
        now,
        warningHours,
        unassignHours,
      });
      if (timing.isSnoozed || timing.isBlocked) continue;

      if (watch.status === "BLOCKED") {
        // Self-block expired without new activity: restart the clock generously
        // rather than punishing the developer for the elapsed time.
        await prisma.pptAssignmentWatch.update({
          where: { id: watch.id },
          data: {
            status: "ACTIVE",
            lastActivityAt: now,
            selfBlockedAt: null,
            selfBlockReason: null,
            selfBlockNote: null,
            selfBlockExpiresAt: null,
          },
        });
        await appendWatchEvent({
          watchId: watch.id,
          linearIssueId: issue.id,
          type: "BLOCK_EXPIRED",
        });
        if (watch.userId) {
          await notifyWithPreferences({
            userId: watch.userId,
            domain: "ppt_task",
            type: "BLOCK_EXPIRED",
            title: `Blocked window ended: ${issue.identifier ?? issue.title ?? "task"}`,
            message: `The blocked pause on this task ended, so its activity timer restarted fresh. Still blocked? Mark it blocked again — repeated blocks are flagged to admins so they can help unblock you.`,
            href: `/dashboard/ppts#task-${issue.id}`,
            entityType: "linear_issue",
            entityId: issue.id,
            payload: { issueId: issue.id, issueUrl: issue.url },
            dedupeKey: `ppt-task:block-expired:${watch.id}:${now.toISOString().slice(0, 13)}`,
            channels: [IN_APP_CHANNEL],
          });
        }
        blockExpired++;
        continue;
      }

      const staleHours = timing.staleHours;
      if (staleHours >= unassignHours) {
        if (await unassignIfNeeded(client, watch, issue, staleHours)) {
          unassigned++;
        }
        continue;
      }
      if (staleHours >= warningHours) {
        if (await warnIfNeeded(client, watch, issue, staleHours)) warned++;
        continue;
      }
      if (
        staleHours >= policy.idleNudgeHours &&
        watch.userId &&
        (!watch.idleNudgedAt || watch.idleNudgedAt < watch.lastActivityAt)
      ) {
        // Gentle in-app-only heads-up well before the formal warning.
        await notifyWithPreferences({
          userId: watch.userId,
          domain: "ppt_task",
          type: "IDLE_NUDGE",
          title: `Still on ${issue.identifier ?? issue.title ?? "your PPT"}?`,
          message: `A quick progress note keeps it yours — the reminder lands at ${warningHours}h without activity. Waiting on someone? Mark it blocked instead, no filler comment needed.`,
          href: `/dashboard/ppts#task-${issue.id}`,
          entityType: "linear_issue",
          entityId: issue.id,
          payload: { issueId: issue.id, issueUrl: issue.url },
          dedupeKey: `ppt-task:idle-nudge:${watch.id}:${watch.lastActivityAt.toISOString()}`,
          channels: [IN_APP_CHANNEL],
        });
        await prisma.pptAssignmentWatch.update({
          where: { id: watch.id },
          data: { idleNudgedAt: now },
        });
        await appendWatchEvent({
          watchId: watch.id,
          linearIssueId: issue.id,
          type: "IDLE_NUDGE",
        });
        nudged++;
      }
    } catch (error) {
      failed++;
      console.error(
        `[ppt-assignment-watch] ${issue.identifier ?? issue.id} failed:`,
        error,
      );
    }
  }

  const resolved = await resolveInactiveWatches(activeKeys);
  return {
    checked,
    warned,
    unassigned,
    nudged,
    blockExpired,
    failed,
    resolved,
    discord: { sent: 0, skipped: true },
  };
}
