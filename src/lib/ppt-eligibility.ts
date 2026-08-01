import type { Prisma } from "@prisma/client";
import { createElement } from "react";
import PptPayoutAdminAlert from "@/emails/PptPayoutAdminAlert";
import PptPayoutBlocked from "@/emails/PptPayoutBlocked";
import TransactionAwaitingReview from "@/emails/TransactionAwaitingReview";
import { awardAchievement } from "@/lib/achievements";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { isWithinCreditLimit, WEEKLY_CREDIT_LIMITS } from "@/lib/credit-limit";
import {
  type CurrencyCode,
  estimateToAmount,
  formatAmount,
  getCurrencyForPaymentMethod,
  linearEstimateToComplexityLevel,
} from "@/lib/currency";
import {
  getLinearClient,
  getLinearServiceClient,
  LinearReauthRequiredError,
} from "@/lib/linear";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { initiateAutoPayout } from "@/lib/payout";
import { PROOF_TAG } from "@/lib/payout-policy";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import { shouldEvaluatePptWebhookHint } from "@/lib/ppt-eligibility-gate";
import {
  describePptNextStep as describePptNextStepBase,
  formatReason,
  getActionForReason as getActionForReasonBase,
  type PptReason,
  type PptStatus,
} from "@/lib/ppt-reason-copy";
import prisma from "@/lib/prisma";

const PPT_LABEL = "PPT";
const DEVELOPER_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const PROOF_LOOKBACK_DAYS = 7;

export type { PptReason, PptStatus } from "@/lib/ppt-reason-copy";
export { formatReason } from "@/lib/ppt-reason-copy";

export type PptEventType =
  | "COMPLETED_DETECTED"
  | "REOPENED_DETECTED"
  | "ISSUE_INVALIDATED"
  | "ASSIGNEE_CHANGED"
  | "ESTIMATE_CHANGED"
  | "ESTIMATE_RECALCULATED"
  | "PROOF_MISSING"
  | "PROOF_ACCEPTED"
  | "PROOF_RESET"
  | "PROOF_OVERRIDDEN"
  | "WAITING_STABILITY"
  | "PAYOUT_BLOCKED"
  | "PAYOUT_HELD"
  | "PAYOUT_RESUMED"
  | "PAYOUT_READY"
  | "TRANSACTION_CREATED"
  | "AUTO_PAYOUT_STARTED"
  | "PAID_ISSUE_REOPENED"
  | "PAID_ISSUE_MUTATED"
  | "DUPLICATE_SUPPRESSED"
  | "STALE_WEBHOOK_SKIPPED"
  | "LINEAR_COMMENTED"
  | "DEVELOPER_NOTIFIED"
  | "ADMIN_ALERT_SENT";

export type PptTrigger =
  | "admin_override"
  | "admin_retry"
  | "comment"
  | "developer_retry"
  | "manual"
  | "proof_submission"
  | "stability_cron"
  | "webhook";

type LinearUserSnapshot = {
  id: string | null;
  email: string | null;
  name: string | null;
  displayName: string | null;
};

type LinearCommentSnapshot = {
  id: string;
  body: string;
  url: string | null;
  userId: string | null;
  createdAt: Date;
  editedAt: Date | null;
};

type LinearHistorySnapshot = {
  actorId: string | null;
  toAssigneeId: string | null;
  fromAssigneeId: string | null;
  toStateId: string | null;
  fromStateId: string | null;
  createdAt: Date;
};

type LinearIssueSnapshot = {
  id: string;
  identifier: string | null;
  title: string | null;
  url: string | null;
  estimate: number | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
  trashed: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  state: {
    type: string | null;
    name: string | null;
    id: string | null;
  };
  assignee: LinearUserSnapshot | null;
  labels: string[];
  comments: LinearCommentSnapshot[];
  history: LinearHistorySnapshot[];
  linearApiError?: string | null;
};

export type PptWebhookIssue = {
  id: string;
  identifier?: string | null;
  title?: string | null;
  url?: string | null;
  estimate?: number | null;
  completedAt?: string | Date | null;
  canceledAt?: string | Date | null;
  archivedAt?: string | Date | null;
  trashed?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  state?: { id?: string | null; type?: string | null; name?: string | null };
  assignee?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    displayName?: string | null;
  } | null;
  labels?: { name?: string | null }[] | null;
};

export type PptWebhookComment = {
  id: string;
  issueId?: string | null;
  body?: string | null;
  userId?: string | null;
};

type PptState = Awaited<ReturnType<typeof findPptState>>;

function coerceDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStabilityMinutes() {
  return getResolvedPayoutPolicy().stabilityMinutes;
}

function getIssueTitle(snapshot: LinearIssueSnapshot) {
  return snapshot.title || snapshot.identifier || "PPT task";
}

/** Env-aware wrapper for server call sites; client components import the base
 * from ppt-reason-copy.ts and thread the resolved stability window as a prop. */
export function getActionForReason(reason: PptReason | null | undefined) {
  return getActionForReasonBase(reason, {
    stabilityMinutes: getStabilityMinutes(),
  });
}

/** Env-aware wrapper for server call sites; see getActionForReason. */
export function describePptNextStep(
  status: PptStatus | string | null | undefined,
  reason: PptReason | string | null | undefined,
) {
  return describePptNextStepBase(status, reason, {
    stabilityMinutes: getStabilityMinutes(),
  });
}

function shouldShowProofTemplate(reason: PptReason) {
  return [
    "MISSING_PROOF",
    "PROOF_RESET_BY_QUESTION",
    "WAITING_STABILITY",
    "REOPENED_BEFORE_PAYOUT",
    "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
  ].includes(reason);
}

function makeGuidanceComment(reason: PptReason, snapshot: LinearIssueSnapshot) {
  const lines = [
    "DevHub payout check",
    "",
    `Status: ${formatReason(reason)}`,
    "",
    `Next step: ${getActionForReason(reason)}`,
    "",
  ];

  if (shouldShowProofTemplate(reason)) {
    lines.push(
      "To qualify this PPT for payout, the current assignee must post a recent proof comment before payout is released:",
      "",
      `${PROOF_TAG}`,
      "- What changed:",
      "- Proof links/screenshots:",
      "- Where it is located or implemented:",
      "- Verification notes:",
      "",
      reason === "REOPENED_BEFORE_PAYOUT"
        ? "Because this issue moved out of Done, previous proof for the old completion no longer qualifies."
        : `The issue must also remain in Done for ${getStabilityMinutes()} minutes.`,
      "",
    );
  }

  lines.push(
    snapshot.url
      ? `[Open in DevHub](${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard)`
      : "",
  );

  return lines.filter(Boolean).join("\n");
}

function isDevHubGuidanceComment(body: string) {
  return body.toLowerCase().includes("devhub payout check");
}

function isMeaningfulProof(body: string) {
  const cleaned = body.replace(new RegExp(PROOF_TAG, "gi"), "").trim();
  if (cleaned.length < 40) return false;
  return /https?:\/\/|!\[|screenshot|screen|video|clip|drive|figma|roblox|studio|place|asset|implemented|location|verified|tested|before|after|commit|branch|pull request|pr/i.test(
    cleaned,
  );
}

function isFollowUpQuestion(body: string) {
  if (isDevHubGuidanceComment(body)) return false;
  return /\?|screenshot|proof|provide|details|where|located|implemented|verify|evidence/i.test(
    body,
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function issueHasPptLabel(snapshot: LinearIssueSnapshot) {
  return snapshot.labels.some((label) => label.toUpperCase() === PPT_LABEL);
}

function isActiveProviderPayout(payout: { status: string } | null | undefined) {
  return Boolean(payout && ["PENDING", "PROCESSING"].includes(payout.status));
}

function clearProofOverrideData() {
  return {
    proofOverride: false,
    proofOverrideById: null,
    proofOverrideAt: null,
    proofOverrideNote: null,
    proofOverrideEpisode: null,
  };
}

function clearProofData() {
  return {
    proofCommentId: null,
    proofCommentUrl: null,
    proofCommentBody: null,
    proofAuthorLinearId: null,
    proofProvidedAt: null,
    ...clearProofOverrideData(),
  };
}

function getProofData(proof: LinearCommentSnapshot | null) {
  return proof
    ? {
        proofCommentId: proof.id,
        proofCommentUrl: proof.url,
        proofCommentBody: proof.body.slice(0, 1000),
        proofAuthorLinearId: proof.userId,
        proofProvidedAt: proof.editedAt ?? proof.createdAt,
      }
    : {};
}

function estimatesMatch(
  left: number | null | undefined,
  right: number | null | undefined,
) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) < 0.0001;
}

function getCompletedAtForState(
  snapshot: LinearIssueSnapshot,
  previousState: PptState,
) {
  if (snapshot.state.type !== "completed") return snapshot.completedAt;
  return snapshot.completedAt ?? previousState?.completedAt ?? new Date();
}

function isCanceledIssue(snapshot: LinearIssueSnapshot) {
  const stateType = snapshot.state.type?.toLowerCase();
  const stateName = snapshot.state.name?.toLowerCase();
  return (
    Boolean(snapshot.canceledAt) ||
    stateType === "canceled" ||
    stateName === "canceled" ||
    stateName === "cancelled"
  );
}

function isArchivedOrTrashedIssue(snapshot: LinearIssueSnapshot) {
  return Boolean(snapshot.archivedAt || snapshot.trashed);
}

function shouldClearProofForReason(reason: PptReason) {
  return [
    "MISSING_PROOF",
    "PROOF_RESET_BY_QUESTION",
    "REOPENED_BEFORE_PAYOUT",
    "PPT_LABEL_REMOVED",
    "ISSUE_CANCELED",
    "ISSUE_ARCHIVED_OR_TRASHED",
    "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
    "LINEAR_API_ERROR",
  ].includes(reason);
}

function shouldHoldTransactionForReason(reason: PptReason) {
  return [
    "MISSING_PPT_LABEL",
    "PPT_LABEL_REMOVED",
    "NOT_COMPLETED",
    "ISSUE_CANCELED",
    "ISSUE_ARCHIVED_OR_TRASHED",
    "MISSING_ESTIMATE",
    "MISSING_ASSIGNEE",
    "NO_LINKED_USER",
    "MISSING_PROOF",
    "PROOF_RESET_BY_QUESTION",
    "APPROVED_BONUS_EXISTS",
    "LINEAR_API_ERROR",
    "REOPENED_BEFORE_PAYOUT",
    "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
  ].includes(reason);
}

function issueFromWebhook(issue: PptWebhookIssue): LinearIssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    url: issue.url ?? null,
    estimate: linearEstimateToComplexityLevel(issue.estimate ?? null),
    completedAt: coerceDate(issue.completedAt),
    canceledAt: coerceDate(issue.canceledAt),
    archivedAt: coerceDate(issue.archivedAt),
    trashed: Boolean(issue.trashed),
    createdAt: coerceDate(issue.createdAt),
    updatedAt: coerceDate(issue.updatedAt),
    state: {
      id: issue.state?.id ?? null,
      type: issue.state?.type ?? null,
      name: issue.state?.name ?? null,
    },
    assignee: issue.assignee
      ? {
          id: issue.assignee.id ?? null,
          email: issue.assignee.email ?? null,
          name: issue.assignee.name ?? null,
          displayName: issue.assignee.displayName ?? null,
        }
      : null,
    labels: Array.isArray(issue.labels)
      ? issue.labels
          .map((label) => label.name?.trim())
          .filter((label): label is string => Boolean(label))
      : [],
    comments: [],
    history: [],
  };
}

async function findLinkedUser(assignee: LinearUserSnapshot | null) {
  if (!assignee?.email && !assignee?.id) return null;

  return prisma.userProfile.findFirst({
    where: {
      OR: [
        ...(assignee.email
          ? [
              {
                linearEmail: {
                  equals: assignee.email,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
        ...(assignee.id ? [{ linearId: assignee.id }] : []),
      ],
    },
    include: { user: { select: { email: true, name: true } } },
  });
}

async function getClientForIssue(userId?: string | null) {
  const serviceClient = getLinearServiceClient();
  if (serviceClient) return serviceClient;
  if (!userId) return null;
  try {
    return await getLinearClient(userId);
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) return null;
    throw error;
  }
}

async function fetchIssueSnapshot(
  issueId: string,
  userId?: string | null,
  fallback?: LinearIssueSnapshot,
): Promise<LinearIssueSnapshot> {
  const client = await getClientForIssue(userId);
  if (!client) {
    return {
      ...(fallback ?? {
        id: issueId,
        identifier: null,
        title: null,
        url: null,
        estimate: null,
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        trashed: false,
        createdAt: null,
        updatedAt: null,
        state: { id: null, type: null, name: null },
        assignee: null,
        labels: [],
        comments: [],
        history: [],
      }),
      linearApiError: "LINEAR_SERVICE_API_KEY is not configured",
    };
  }

  try {
    const issue = await client.issue(issueId);
    const linearIssue = issue as typeof issue & {
      archivedAt?: Date | null;
      canceledAt?: Date | null;
      trashed?: boolean | null;
    };
    const [state, assignee, labels, comments, history] = await Promise.all([
      issue.state,
      issue.assignee,
      issue.labels({ first: 50 }),
      issue.comments({ first: 100 }),
      issue.history({ first: 100 }),
    ]);

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      estimate: linearEstimateToComplexityLevel(issue.estimate ?? null),
      completedAt: issue.completedAt ?? null,
      canceledAt: linearIssue.canceledAt ?? null,
      archivedAt: linearIssue.archivedAt ?? null,
      trashed: Boolean(linearIssue.trashed),
      createdAt: issue.createdAt ?? null,
      updatedAt: issue.updatedAt ?? null,
      state: {
        id: state?.id ?? null,
        type: state?.type ?? null,
        name: state?.name ?? null,
      },
      assignee: assignee
        ? {
            id: assignee.id,
            email: assignee.email ?? null,
            name: assignee.name ?? null,
            displayName: assignee.displayName ?? null,
          }
        : null,
      labels: labels.nodes.map((label) => label.name),
      comments: comments.nodes.map((comment) => ({
        id: comment.id,
        body: comment.body,
        url: comment.url ?? null,
        userId: comment.userId ?? null,
        createdAt: comment.createdAt,
        editedAt: comment.editedAt ?? null,
      })),
      history: history.nodes.map((entry) => ({
        actorId: entry.actorId ?? null,
        toAssigneeId: entry.toAssigneeId ?? null,
        fromAssigneeId: entry.fromAssigneeId ?? null,
        toStateId: entry.toStateId ?? null,
        fromStateId: entry.fromStateId ?? null,
        createdAt: entry.createdAt,
      })),
    };
  } catch (error) {
    console.error("[ppt-eligibility] Failed to fetch Linear issue:", error);
    return {
      ...(fallback ?? {
        id: issueId,
        identifier: null,
        title: null,
        url: null,
        estimate: null,
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        trashed: false,
        createdAt: null,
        updatedAt: null,
        state: { id: null, type: null, name: null },
        assignee: null,
        labels: [],
        comments: [],
        history: [],
      }),
      linearApiError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findPptState(linearIssueId: string) {
  return prisma.pptPayoutState.findUnique({
    where: { linearIssueId },
    include: {
      transaction: { include: { payout: true } },
      user: { include: { user: { select: { email: true, name: true } } } },
    },
  });
}

function latestAssignmentAt(snapshot: LinearIssueSnapshot, state: PptState) {
  const assigneeId = snapshot.assignee?.id;
  const latestHistory = snapshot.history
    .filter((entry) => entry.toAssigneeId && entry.toAssigneeId === assigneeId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (latestHistory?.createdAt) return latestHistory.createdAt;
  if (
    state?.assigneeLinearId &&
    assigneeId &&
    state.assigneeLinearId !== assigneeId
  ) {
    return snapshot.updatedAt ?? new Date();
  }

  return state?.latestAssignmentAt ?? snapshot.createdAt ?? new Date(0);
}

function lowerBoundForProof(
  snapshot: LinearIssueSnapshot,
  state: PptState,
  assignmentAt: Date,
) {
  const dates = [
    assignmentAt,
    state?.lastReopenedAt ?? null,
    snapshot.completedAt
      ? new Date(
          snapshot.completedAt.getTime() -
            PROOF_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        )
      : null,
  ].filter((date): date is Date => Boolean(date));

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function findQualifyingProof(
  snapshot: LinearIssueSnapshot,
  state: PptState,
  assignmentAt: Date,
) {
  const assigneeId = snapshot.assignee?.id;
  if (!assigneeId) return null;

  const lowerBound = lowerBoundForProof(snapshot, state, assignmentAt);
  const candidates = snapshot.comments
    .filter((comment) => {
      const proofAt = comment.editedAt ?? comment.createdAt;
      return (
        comment.userId === assigneeId &&
        proofAt >= lowerBound &&
        comment.body.toLowerCase().includes(PROOF_TAG) &&
        isMeaningfulProof(comment.body)
      );
    })
    .sort(
      (a, b) =>
        (b.editedAt ?? b.createdAt).getTime() -
        (a.editedAt ?? a.createdAt).getTime(),
    );

  return candidates[0] ?? null;
}

function findResetQuestion(
  snapshot: LinearIssueSnapshot,
  proof: LinearCommentSnapshot | null,
  state: PptState,
) {
  const assigneeId = snapshot.assignee?.id;
  const proofAt = proof ? (proof.editedAt ?? proof.createdAt) : null;
  const completedAt = snapshot.completedAt ?? state?.completedAt ?? new Date(0);

  return snapshot.comments
    .filter((comment) => {
      if (!comment.userId || comment.userId === assigneeId) return false;
      const commentAt = comment.editedAt ?? comment.createdAt;
      if (commentAt < completedAt) return false;
      if (proofAt && commentAt <= proofAt) return false;
      return isFollowUpQuestion(comment.body);
    })
    .sort(
      (a, b) =>
        (b.editedAt ?? b.createdAt).getTime() -
        (a.editedAt ?? a.createdAt).getTime(),
    )[0];
}

async function upsertStateBase(
  snapshot: LinearIssueSnapshot,
  userId: string | null,
  status: PptStatus,
  reason: PptReason | null,
  completionEpisode: number,
  assignmentAt: Date | null,
  completedAt: Date | null,
  assigneeChangedAt: Date | null,
  estimateChangedAt: Date | null,
) {
  return prisma.pptPayoutState.upsert({
    where: { linearIssueId: snapshot.id },
    create: {
      linearIssueId: snapshot.id,
      linearIssueIdentifier: snapshot.identifier,
      linearIssueTitle: snapshot.title,
      linearIssueUrl: snapshot.url,
      latestLinearStateType: snapshot.state.type,
      latestLinearStateName: snapshot.state.name,
      latestLinearUpdatedAt: snapshot.updatedAt ?? undefined,
      hasPptLabel: issueHasPptLabel(snapshot),
      estimate: snapshot.estimate,
      userId,
      assigneeLinearId: snapshot.assignee?.id ?? null,
      assigneeEmail: snapshot.assignee?.email ?? null,
      assigneeName:
        snapshot.assignee?.displayName ?? snapshot.assignee?.name ?? null,
      status,
      reason,
      completionEpisode,
      completedAt,
      canceledAt: snapshot.canceledAt,
      archivedAt: snapshot.archivedAt,
      trashed: snapshot.trashed,
      latestAssignmentAt: assignmentAt,
      lastAssigneeChangeAt: assigneeChangedAt,
      lastEstimateChangeAt: estimateChangedAt,
    },
    update: {
      linearIssueIdentifier: snapshot.identifier,
      linearIssueTitle: snapshot.title,
      linearIssueUrl: snapshot.url,
      latestLinearStateType: snapshot.state.type,
      latestLinearStateName: snapshot.state.name,
      latestLinearUpdatedAt: snapshot.updatedAt ?? undefined,
      hasPptLabel: issueHasPptLabel(snapshot),
      estimate: snapshot.estimate,
      userId,
      assigneeLinearId: snapshot.assignee?.id ?? null,
      assigneeEmail: snapshot.assignee?.email ?? null,
      assigneeName:
        snapshot.assignee?.displayName ?? snapshot.assignee?.name ?? null,
      status,
      reason,
      completionEpisode,
      completedAt,
      canceledAt: snapshot.canceledAt,
      archivedAt: snapshot.archivedAt,
      trashed: snapshot.trashed,
      latestAssignmentAt: assignmentAt,
      lastAssigneeChangeAt: assigneeChangedAt ?? undefined,
      lastEstimateChangeAt: estimateChangedAt ?? undefined,
    },
  });
}

async function appendEvent({
  stateId,
  linearIssueId,
  type,
  reason,
  actorLinearId,
  message,
  metadata,
}: {
  stateId: string;
  linearIssueId: string;
  type: PptEventType;
  reason?: PptReason | null;
  actorLinearId?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.pptPayoutEvent.create({
    data: {
      stateId,
      linearIssueId,
      type,
      reason,
      actorLinearId,
      message,
      metadata,
    },
  });
}

async function notifyDeveloper(
  stateId: string,
  userId: string | null,
  snapshot: LinearIssueSnapshot,
  reason: PptReason,
  type: "BLOCKED" | "HELD" | "READY" | "PROOF_ACCEPTED" | "PAID_REOPENED",
) {
  if (!userId) return;

  const state = await prisma.pptPayoutState.findUnique({
    where: { id: stateId },
    include: {
      user: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  const lastNotified = state?.lastDeveloperNotifiedAt?.getTime() ?? 0;
  if (Date.now() - lastNotified < DEVELOPER_NOTIFY_COOLDOWN_MS) return;

  const title = snapshot.identifier
    ? `${snapshot.identifier} - ${getIssueTitle(snapshot)}`
    : getIssueTitle(snapshot);
  const message = formatReason(reason);

  await notify({
    userId,
    domain: "ppt",
    type,
    title,
    message,
    href: `/dashboard/ppts#task-${snapshot.id}`,
    entityType: "ppt_payout_state",
    entityId: stateId,
    payload: {
      stateId,
      identifier: snapshot.identifier,
      issueTitle: getIssueTitle(snapshot),
      issueUrl: snapshot.url,
      reason,
    },
    dedupeKey: `ppt:developer:${userId}:${stateId}:${state?.completionEpisode ?? "unknown"}:${reason}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: state?.user?.user.email
      ? {
          to: state.user.user.email,
          subject: `PPT payout update: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
          category: "ppt_developer_notice",
          idempotencyKey: `ppt:developer:${stateId}:${state.completionEpisode}:${reason}`,
          react: createElement(PptPayoutBlocked, {
            userName:
              state.user.legalName || state.user.user.name || "developer",
            issueIdentifier: snapshot.identifier,
            issueTitle: getIssueTitle(snapshot),
            issueUrl: snapshot.url,
            reason: formatReason(reason),
            action: getActionForReason(reason),
          }),
        }
      : undefined,
  });

  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: { lastDeveloperNotifiedAt: new Date() },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "DEVELOPER_NOTIFIED",
    reason,
  });
}

async function notifyAdmins(
  stateId: string,
  snapshot: LinearIssueSnapshot,
  reason: PptReason,
  detail?: string,
) {
  const message = detail?.trim() || null;
  const existingAlert = await prisma.pptPayoutEvent.findFirst({
    where: {
      stateId,
      type: "ADMIN_ALERT_SENT",
      reason,
    },
    select: { id: true },
  });
  if (existingAlert) return;

  const [state, admins] = await Promise.all([
    prisma.pptPayoutState.findUnique({
      where: { id: stateId },
      include: { user: { include: { user: { select: { name: true } } } } },
    }),
    prisma.userProfile.findMany({
      where: ADMIN_ACCESS_WHERE,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  for (const admin of admins) {
    if (!admin.user.email) continue;
    await notify({
      userId: admin.id,
      domain: "ppt",
      type: "ADMIN_ALERT",
      title: `PPT payout alert: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
      message: message ?? formatReason(reason),
      href: "/dashboard/admin",
      entityType: "ppt_payout_state",
      entityId: stateId,
      payload: {
        stateId,
        identifier: snapshot.identifier,
        issueTitle: getIssueTitle(snapshot),
        reason,
      },
      dedupeKey: `ppt:admin-alert:${admin.id}:${stateId}:${reason}`,
      channels: [EMAIL_CHANNEL],
      email: {
        to: admin.user.email,
        subject: `PPT payout alert: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
        category: "ppt_admin_alert",
        idempotencyKey: `ppt:admin-alert:${stateId}:${reason}`,
        react: createElement(PptPayoutAdminAlert, {
          issueIdentifier: snapshot.identifier,
          issueTitle: getIssueTitle(snapshot),
          developerName:
            state?.user?.legalName ||
            state?.user?.user.name ||
            snapshot.assignee?.displayName ||
            snapshot.assignee?.name,
          reason: formatReason(reason),
          detail: message ?? undefined,
        }),
      },
    });
  }

  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: { lastAdminNotifiedAt: new Date() },
  });
  try {
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "ADMIN_ALERT_SENT",
      reason,
      message,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
}

async function commentGuidanceIfNeeded(
  stateId: string,
  snapshot: LinearIssueSnapshot,
  reason: PptReason,
) {
  if (reason === "NOT_COMPLETED") return;

  const serviceClient = getLinearServiceClient();
  if (!serviceClient) return;

  const state = await prisma.pptPayoutState.findUnique({
    where: { id: stateId },
    select: {
      lastLinearCommentReason: true,
      lastLinearCommentAt: true,
      completionEpisode: true,
      completedAt: true,
      lastReopenedAt: true,
    },
  });
  const episodeStartedAt =
    state?.lastReopenedAt ?? state?.completedAt ?? new Date(0);
  const existingEpisodeComment = await prisma.pptPayoutEvent.findFirst({
    where: {
      stateId,
      type: "LINEAR_COMMENTED",
      reason,
      createdAt: { gte: episodeStartedAt },
    },
    select: { id: true },
  });
  if (existingEpisodeComment) return;

  const recent =
    state?.lastLinearCommentAt &&
    Date.now() - state.lastLinearCommentAt.getTime() <
      DEVELOPER_NOTIFY_COOLDOWN_MS;
  if (state?.lastLinearCommentReason === reason && recent) return;

  try {
    await serviceClient.createComment({
      issueId: snapshot.id,
      body: makeGuidanceComment(reason, snapshot),
    });
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        lastLinearCommentReason: reason,
        lastLinearCommentAt: new Date(),
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "LINEAR_COMMENTED",
      reason,
    });
  } catch (error) {
    console.error("[ppt-eligibility] Failed to comment in Linear:", error);
  }
}

async function blockPayout(
  snapshot: LinearIssueSnapshot,
  stateId: string,
  userId: string | null,
  reason: PptReason,
  status: PptStatus = "BLOCKED",
  eventType: PptEventType = "PAYOUT_BLOCKED",
) {
  const existingTransaction = await prisma.transaction.findUnique({
    where: { linearIssueId: snapshot.id },
    include: { payout: true },
  });
  let nextStatus = status;
  let nextReason = reason;
  let nextEventType = eventType;
  let adminDetail: string | null = null;

  if (existingTransaction && shouldHoldTransactionForReason(reason)) {
    if (existingTransaction.status === "PAID") {
      nextStatus = "FLAGGED";
      nextReason = "PAID_ISSUE_NEEDS_REVIEW";
      nextEventType = "PAID_ISSUE_MUTATED";
      adminDetail = `A paid PPT issue no longer satisfies payout eligibility: ${formatReason(reason)}`;
    } else if (isActiveProviderPayout(existingTransaction.payout)) {
      nextStatus = "FLAGGED";
      nextEventType = "PAYOUT_HELD";
      adminDetail = `A payout provider is already active while eligibility changed: ${formatReason(reason)}`;
    } else if (existingTransaction.status === "PENDING") {
      await prisma.transaction.update({
        where: { id: existingTransaction.id },
        data: { status: "ON_HOLD" },
      });
      nextStatus = "ON_HOLD";
      nextEventType = "PAYOUT_HELD";
    } else if (existingTransaction.status === "ON_HOLD") {
      nextStatus = "ON_HOLD";
      nextEventType = "PAYOUT_HELD";
    } else if (existingTransaction.status === "CANCELLED") {
      nextStatus = "FLAGGED";
      adminDetail =
        "A cancelled transaction already exists for this Linear issue; DevHub will not create a duplicate automatically.";
    }
  }

  const clearProof = shouldClearProofForReason(reason);
  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: {
      status: nextStatus,
      reason: nextReason,
      warningCount: { increment: 1 },
      ...(clearProof ? clearProofData() : {}),
    },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: nextEventType,
    reason: nextReason,
    message: formatReason(reason),
    metadata:
      nextReason === reason
        ? undefined
        : {
            originalReason: reason,
            transactionId: existingTransaction?.id ?? null,
          },
  });

  await notifyDeveloper(
    stateId,
    userId,
    snapshot,
    nextReason,
    existingTransaction?.status === "PAID"
      ? "PAID_REOPENED"
      : nextStatus === "ON_HOLD" || nextStatus === "FLAGGED"
        ? "HELD"
        : "BLOCKED",
  );
  await commentGuidanceIfNeeded(stateId, snapshot, nextReason);

  if (adminDetail) {
    await notifyAdmins(stateId, snapshot, nextReason, adminDetail);
  }
}

async function invalidateTrackedIssue({
  snapshot,
  stateId,
  existingState,
  userId,
  reason,
  processingReason,
  paidReason,
  detail,
}: {
  snapshot: LinearIssueSnapshot;
  stateId: string;
  existingState: PptState;
  userId: string | null;
  reason: PptReason;
  processingReason: PptReason;
  paidReason: PptReason;
  detail: string;
}) {
  const existingTransaction =
    existingState?.transaction ??
    (await prisma.transaction.findUnique({
      where: { linearIssueId: snapshot.id },
      include: { payout: true },
    }));

  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: clearProofData(),
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "ISSUE_INVALIDATED",
    reason,
    message: detail,
  });

  if (!existingTransaction || existingTransaction.status === "REJECTED") {
    await blockPayout(snapshot, stateId, userId, reason, "BLOCKED");
    return;
  }

  if (existingTransaction.status === "PAID") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: { status: "FLAGGED", reason: paidReason },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAID_ISSUE_MUTATED",
      reason: paidReason,
      message: detail,
    });
    await notifyDeveloper(
      stateId,
      userId,
      snapshot,
      paidReason,
      "PAID_REOPENED",
    );
    await notifyAdmins(stateId, snapshot, paidReason, detail);
    await commentGuidanceIfNeeded(stateId, snapshot, paidReason);
    return;
  }

  if (isActiveProviderPayout(existingTransaction.payout)) {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: { status: "FLAGGED", reason: processingReason },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAYOUT_HELD",
      reason: processingReason,
      message: detail,
    });
    await notifyDeveloper(stateId, userId, snapshot, processingReason, "HELD");
    await notifyAdmins(
      stateId,
      snapshot,
      processingReason,
      `${detail} DevHub did not attempt unsupported provider cancellation automatically.`,
    );
    await commentGuidanceIfNeeded(stateId, snapshot, processingReason);
    return;
  }

  if (existingTransaction.status === "PENDING") {
    await prisma.transaction.update({
      where: { id: existingTransaction.id },
      data: { status: "ON_HOLD" },
    });
  }

  await blockPayout(
    snapshot,
    stateId,
    userId,
    reason,
    "ON_HOLD",
    "PAYOUT_HELD",
  );
}

async function notifyAdminsForReopenBounceIfNeeded(
  stateId: string,
  snapshot: LinearIssueSnapshot,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [reopenCount, state] = await Promise.all([
    prisma.pptPayoutEvent.count({
      where: {
        stateId,
        type: "REOPENED_DETECTED",
        createdAt: { gte: since },
      },
    }),
    prisma.pptPayoutState.findUnique({
      where: { id: stateId },
      select: { lastAdminNotifiedAt: true },
    }),
  ]);
  if (reopenCount < 2) return;
  const lastNotified = state?.lastAdminNotifiedAt?.getTime() ?? 0;
  if (Date.now() - lastNotified < DEVELOPER_NOTIFY_COOLDOWN_MS) return;

  await notifyAdmins(
    stateId,
    snapshot,
    "REOPENED_BEFORE_PAYOUT",
    `This PPT has bounced out of Done ${reopenCount} times in the last 24 hours. DevHub is blocking or holding automatic payout until the latest completion has fresh proof.`,
  );
}

async function handleReopenedIssue(
  snapshot: LinearIssueSnapshot,
  stateId: string,
  existingState: PptState,
  userId: string | null,
) {
  const existingTransaction =
    existingState?.transaction ??
    (await prisma.transaction.findUnique({
      where: { linearIssueId: snapshot.id },
      include: { payout: true },
    }));
  const now = new Date();

  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: {
      lastReopenedAt: now,
      ...clearProofData(),
    },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "REOPENED_DETECTED",
    reason: "REOPENED_BEFORE_PAYOUT",
  });
  await notifyAdminsForReopenBounceIfNeeded(stateId, snapshot);

  if (!existingTransaction || existingTransaction.status === "REJECTED") {
    await blockPayout(
      snapshot,
      stateId,
      userId,
      "REOPENED_BEFORE_PAYOUT",
      "BLOCKED",
      "PAYOUT_BLOCKED",
    );
    return;
  }

  if (existingTransaction.status === "PAID") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: { status: "FLAGGED", reason: "PAID_ISSUE_REOPENED" },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAID_ISSUE_REOPENED",
      reason: "PAID_ISSUE_REOPENED",
    });
    await notifyDeveloper(
      stateId,
      userId,
      snapshot,
      "PAID_ISSUE_REOPENED",
      "PAID_REOPENED",
    );
    await notifyAdmins(
      stateId,
      snapshot,
      "PAID_ISSUE_REOPENED",
      "This issue reopened after its payout was already paid. DevHub will not create another transaction.",
    );
    await commentGuidanceIfNeeded(stateId, snapshot, "PAID_ISSUE_REOPENED");
    return;
  }

  if (isActiveProviderPayout(existingTransaction.payout)) {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: "FLAGGED",
        reason: "REOPENED_DURING_PAYOUT_PROCESSING",
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAYOUT_HELD",
      reason: "REOPENED_DURING_PAYOUT_PROCESSING",
    });
    await notifyDeveloper(
      stateId,
      userId,
      snapshot,
      "REOPENED_DURING_PAYOUT_PROCESSING",
      "HELD",
    );
    await notifyAdmins(
      stateId,
      snapshot,
      "REOPENED_DURING_PAYOUT_PROCESSING",
      "A provider payout is already active; DevHub did not attempt automatic cancellation.",
    );
    await commentGuidanceIfNeeded(
      stateId,
      snapshot,
      "REOPENED_DURING_PAYOUT_PROCESSING",
    );
    return;
  }

  if (existingTransaction.status === "PENDING") {
    await prisma.transaction.update({
      where: { id: existingTransaction.id },
      data: { status: "ON_HOLD" },
    });
  }

  await blockPayout(
    snapshot,
    stateId,
    userId,
    "REOPENED_BEFORE_PAYOUT",
    "ON_HOLD",
    "PAYOUT_HELD",
  );
}

async function handleEstimateChange(
  snapshot: LinearIssueSnapshot,
  stateId: string,
  existingState: PptState,
  userId: string | null,
  currency: CurrencyCode | null,
) {
  const previousEstimate = existingState?.estimate;
  if (
    previousEstimate == null ||
    snapshot.estimate == null ||
    estimatesMatch(previousEstimate, snapshot.estimate)
  ) {
    return "NONE" as const;
  }

  const existingTransaction =
    existingState?.transaction ??
    (await prisma.transaction.findUnique({
      where: { linearIssueId: snapshot.id },
      include: { payout: true },
    }));

  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "ESTIMATE_CHANGED",
    reason: "ESTIMATE_CHANGED_RECALCULATED",
    metadata: {
      previousEstimate,
      currentEstimate: snapshot.estimate,
    },
  });
  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: clearProofOverrideData(),
  });

  if (!existingTransaction || existingTransaction.status === "REJECTED") {
    return "RECORDED" as const;
  }

  const detail = `Estimate changed from ${previousEstimate} to ${snapshot.estimate}.`;
  if (existingTransaction.status === "PAID") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: { status: "FLAGGED", reason: "PAID_ISSUE_ESTIMATE_CHANGED" },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAID_ISSUE_MUTATED",
      reason: "PAID_ISSUE_ESTIMATE_CHANGED",
      message: detail,
    });
    await notifyDeveloper(
      stateId,
      userId,
      snapshot,
      "PAID_ISSUE_ESTIMATE_CHANGED",
      "PAID_REOPENED",
    );
    await notifyAdmins(
      stateId,
      snapshot,
      "PAID_ISSUE_ESTIMATE_CHANGED",
      detail,
    );
    await commentGuidanceIfNeeded(
      stateId,
      snapshot,
      "PAID_ISSUE_ESTIMATE_CHANGED",
    );
    return "FLAGGED" as const;
  }

  if (isActiveProviderPayout(existingTransaction.payout)) {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: "FLAGGED",
        reason: "ESTIMATE_CHANGED_DURING_PROCESSING",
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAYOUT_HELD",
      reason: "ESTIMATE_CHANGED_DURING_PROCESSING",
      message: detail,
    });
    await notifyDeveloper(
      stateId,
      userId,
      snapshot,
      "ESTIMATE_CHANGED_DURING_PROCESSING",
      "HELD",
    );
    await notifyAdmins(
      stateId,
      snapshot,
      "ESTIMATE_CHANGED_DURING_PROCESSING",
      `${detail} A provider payout is already active; DevHub did not attempt automatic cancellation.`,
    );
    await commentGuidanceIfNeeded(
      stateId,
      snapshot,
      "ESTIMATE_CHANGED_DURING_PROCESSING",
    );
    return "FLAGGED" as const;
  }

  if (
    !userId ||
    !currency ||
    !["PENDING", "ON_HOLD"].includes(existingTransaction.status)
  ) {
    return "RECORDED" as const;
  }

  const amount = estimateToAmount(snapshot.estimate, currency);
  const withinLimit = await isWithinCreditLimit(userId, currency, amount);
  await prisma.transaction.update({
    where: { id: existingTransaction.id },
    data: {
      userId,
      linearIssueIdentifier: snapshot.identifier,
      linearIssueTitle: snapshot.title,
      linearIssueUrl: snapshot.url,
      amount,
      currency,
      autoApproved: withinLimit,
    },
  });
  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: {
      reason: "ESTIMATE_CHANGED_RECALCULATED",
      lastEstimateChangeAt: snapshot.updatedAt ?? new Date(),
    },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "ESTIMATE_RECALCULATED",
    reason: "ESTIMATE_CHANGED_RECALCULATED",
    metadata: { amount, currency, withinLimit },
  });
  await notifyDeveloper(
    stateId,
    userId,
    snapshot,
    "ESTIMATE_CHANGED_RECALCULATED",
    existingTransaction.status === "ON_HOLD" ? "HELD" : "READY",
  );
  await notifyAdmins(
    stateId,
    snapshot,
    "ESTIMATE_CHANGED_RECALCULATED",
    `${detail} Unpaid transaction ${existingTransaction.id} was recalculated to ${amount} ${currency}.`,
  );
  return "UPDATED" as const;
}

async function handleEligiblePayout(
  snapshot: LinearIssueSnapshot,
  stateId: string,
  userId: string,
  currency: CurrencyCode,
  amount: number,
  proof: LinearCommentSnapshot | null,
) {
  const proofData = getProofData(proof);
  const existing = await prisma.transaction.findUnique({
    where: { linearIssueId: snapshot.id },
    include: { payout: true },
  });

  if (existing?.status === "PAID") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: "PAID",
        reason: "DUPLICATE_TRANSACTION",
        transactionId: existing.id,
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "DUPLICATE_SUPPRESSED",
      reason: "DUPLICATE_TRANSACTION",
    });
    return;
  }

  if (existing?.status === "CANCELLED") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: "FLAGGED",
        reason: "DUPLICATE_TRANSACTION",
        transactionId: existing.id,
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "DUPLICATE_SUPPRESSED",
      reason: "DUPLICATE_TRANSACTION",
      message:
        "A cancelled transaction already exists for this Linear issue; DevHub will not create a duplicate automatically.",
    });
    await notifyAdmins(
      stateId,
      snapshot,
      "DUPLICATE_TRANSACTION",
      "A cancelled transaction already exists for this Linear issue. Manual admin review is required before any payout retry.",
    );
    return;
  }

  if (existing?.status === "PENDING") {
    const withinLimit = await isWithinCreditLimit(userId, currency, amount);
    const transactionChanged =
      existing.userId !== userId ||
      !estimatesMatch(existing.amount, amount) ||
      existing.currency !== currency ||
      existing.linearIssueIdentifier !== snapshot.identifier ||
      existing.linearIssueTitle !== snapshot.title ||
      existing.linearIssueUrl !== snapshot.url ||
      existing.autoApproved !== withinLimit;

    const transactionUpdated =
      !isActiveProviderPayout(existing.payout) && transactionChanged;

    if (transactionUpdated) {
      await prisma.transaction.update({
        where: { id: existing.id },
        data: {
          userId,
          linearIssueIdentifier: snapshot.identifier,
          linearIssueTitle: snapshot.title,
          linearIssueUrl: snapshot.url,
          amount,
          currency,
          autoApproved: withinLimit,
        },
      });
      await appendEvent({
        stateId,
        linearIssueId: snapshot.id,
        type: "ESTIMATE_RECALCULATED",
        reason: "ESTIMATE_CHANGED_RECALCULATED",
        metadata: { amount, currency, withinLimit },
      });
    }

    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: "TRANSACTION_PENDING",
        reason: transactionUpdated
          ? "ESTIMATE_CHANGED_RECALCULATED"
          : "DUPLICATE_TRANSACTION",
        transactionId: existing.id,
        ...proofData,
      },
    });
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "DUPLICATE_SUPPRESSED",
      reason: "DUPLICATE_TRANSACTION",
    });

    if (
      withinLimit &&
      !isActiveProviderPayout(existing.payout) &&
      existing.payout?.status !== "COMPLETED"
    ) {
      try {
        const payout = await initiateAutoPayout(existing.id);
        if (payout) {
          await appendEvent({
            stateId,
            linearIssueId: snapshot.id,
            type: "AUTO_PAYOUT_STARTED",
            reason: "AUTO_PAYOUT_STARTED",
            metadata: { payoutId: payout.id },
          });
        } else {
          await notifyAdmins(
            stateId,
            snapshot,
            "TRANSACTION_CREATED",
            "No automatic payout provider could be started; this payout needs manual review.",
          );
        }
      } catch (error) {
        console.error("[ppt-eligibility] Auto-payout retry failed:", error);
        await notifyAdmins(
          stateId,
          snapshot,
          "AUTO_PAYOUT_STARTED",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return;
  }

  const approvedBonus = await prisma.bonusCandidate.findFirst({
    where: { linearIssueId: snapshot.id, status: "APPROVED" },
    select: { id: true },
  });
  if (approvedBonus) {
    await blockPayout(
      snapshot,
      stateId,
      userId,
      "APPROVED_BONUS_EXISTS",
      "BLOCKED",
    );
    return;
  }

  const withinLimit = await isWithinCreditLimit(userId, currency, amount);

  let transactionId: string;
  if (existing?.status === "ON_HOLD") {
    const tx = await prisma.$transaction(async (db) => {
      const updated = await db.transaction.update({
        where: { id: existing.id },
        data: {
          userId,
          linearIssueIdentifier: snapshot.identifier,
          linearIssueTitle: snapshot.title,
          linearIssueUrl: snapshot.url,
          amount,
          currency,
          status: "PENDING",
          autoApproved: withinLimit,
        },
      });
      await db.pptPayoutState.update({
        where: { id: stateId },
        data: {
          status: "TRANSACTION_PENDING",
          reason: "TRANSACTION_CREATED",
          transactionId: updated.id,
          ...proofData,
        },
      });
      return updated;
    });
    transactionId = tx.id;
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "PAYOUT_RESUMED",
      reason: "TRANSACTION_CREATED",
    });
  } else {
    if (existing?.status === "REJECTED") {
      await prisma.payout.deleteMany({ where: { transactionId: existing.id } });
      await prisma.transaction.delete({ where: { id: existing.id } });
    }

    let duplicateSuppressed = false;
    const tx = await prisma
      .$transaction(async (db) => {
        const created = await db.transaction.create({
          data: {
            userId,
            linearIssueId: snapshot.id,
            linearIssueIdentifier: snapshot.identifier,
            linearIssueTitle: snapshot.title,
            linearIssueUrl: snapshot.url,
            amount,
            currency,
            source: "PPT",
            status: "PENDING",
            autoApproved: withinLimit,
          },
        });
        await db.pptPayoutState.update({
          where: { id: stateId },
          data: {
            status: "TRANSACTION_PENDING",
            reason: "TRANSACTION_CREATED",
            transactionId: created.id,
            ...proofData,
          },
        });
        return created;
      })
      .catch(async (error) => {
        if (!isUniqueConstraintError(error)) throw error;
        const duplicate = await prisma.transaction.findUnique({
          where: { linearIssueId: snapshot.id },
        });
        if (!duplicate) throw error;
        await prisma.pptPayoutState.update({
          where: { id: stateId },
          data: {
            status:
              duplicate.status === "PAID"
                ? "PAID"
                : duplicate.status === "ON_HOLD"
                  ? "ON_HOLD"
                  : "TRANSACTION_PENDING",
            reason: "DUPLICATE_TRANSACTION",
            transactionId: duplicate.id,
          },
        });
        await appendEvent({
          stateId,
          linearIssueId: snapshot.id,
          type: "DUPLICATE_SUPPRESSED",
          reason: "DUPLICATE_TRANSACTION",
        });
        duplicateSuppressed = true;
        return duplicate;
      });
    transactionId = tx.id;
    if (duplicateSuppressed) return;
    await appendEvent({
      stateId,
      linearIssueId: snapshot.id,
      type: "TRANSACTION_CREATED",
      reason: "TRANSACTION_CREATED",
      metadata: { amount, currency },
    });
  }

  if (userId && withinLimit) {
    await notify({
      userId,
      domain: "ppt",
      type: "READY",
      title: snapshot.identifier ?? getIssueTitle(snapshot),
      message:
        "Your PPT payout was created and is being sent automatically — it's within your weekly credit limit.",
      href: `/dashboard/ppts#task-${snapshot.id}`,
      entityType: "ppt_payout_state",
      entityId: stateId,
      payload: {
        stateId,
        identifier: snapshot.identifier,
        issueTitle: getIssueTitle(snapshot),
        issueUrl: snapshot.url,
      },
      dedupeKey: `ppt:ready:${userId}:${stateId}`,
      channels: [IN_APP_CHANNEL],
    });
  } else if (userId && !withinLimit) {
    // Tell the developer the truth about over-limit payouts — previously only
    // admins learned why these sat in PENDING.
    const linkedUser = await prisma.userProfile.findUnique({
      where: { id: userId },
      include: { user: { select: { email: true, name: true } } },
    });
    const limit = WEEKLY_CREDIT_LIMITS[currency] ?? 0;
    await notify({
      userId,
      domain: "payment",
      type: "AWAITING_REVIEW",
      title: snapshot.identifier ?? getIssueTitle(snapshot),
      message: `Your payout of ${formatAmount(amount, currency)} was created but is past this week's ${formatAmount(limit, currency)} auto-approval limit, so an admin will release it manually. It is not lost — limits reset every Monday (UTC).`,
      href: "/dashboard/transactions",
      entityType: "transaction",
      entityId: transactionId,
      payload: {
        stateId,
        transactionId,
        identifier: snapshot.identifier,
        issueTitle: getIssueTitle(snapshot),
      },
      dedupeKey: `payment:awaiting_review:${userId}:${transactionId}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: linkedUser?.user.email
        ? {
            to: linkedUser.user.email,
            subject: `Payout awaiting review: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
            category: "payment_awaiting_review",
            idempotencyKey: `payment:awaiting_review:${transactionId}`,
            react: createElement(TransactionAwaitingReview, {
              userName:
                linkedUser.legalName || linkedUser.user.name || "developer",
              issueIdentifier: snapshot.identifier,
              issueTitle: getIssueTitle(snapshot),
              amountLabel: formatAmount(amount, currency),
              limitLabel: formatAmount(limit, currency),
            }),
          }
        : undefined,
    });
  }

  if (withinLimit) {
    try {
      const payout = await initiateAutoPayout(transactionId);
      if (payout) {
        await appendEvent({
          stateId,
          linearIssueId: snapshot.id,
          type: "AUTO_PAYOUT_STARTED",
          reason: "AUTO_PAYOUT_STARTED",
          metadata: { payoutId: payout.id },
        });
      } else {
        await notifyAdmins(
          stateId,
          snapshot,
          "TRANSACTION_CREATED",
          "No automatic payout provider could be started; this payout needs manual review.",
        );
      }
    } catch (error) {
      console.error("[ppt-eligibility] Auto-payout failed:", error);
      await notifyAdmins(
        stateId,
        snapshot,
        "AUTO_PAYOUT_STARTED",
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    await notifyAdmins(
      stateId,
      snapshot,
      "TRANSACTION_CREATED",
      "The payout is outside the weekly auto-approval limit and needs manual review.",
    );
  }

  const latestTx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { status: true },
  });
  if (latestTx?.status === "PAID") {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: { status: "PAID" },
    });
  }
}

export async function evaluatePptIssueById(
  issueId: string,
  options: { userId?: string | null; trigger?: PptTrigger } = {},
) {
  const fallbackState = await findPptState(issueId);
  const fallback: LinearIssueSnapshot | undefined = fallbackState
    ? {
        id: fallbackState.linearIssueId,
        identifier: fallbackState.linearIssueIdentifier,
        title: fallbackState.linearIssueTitle,
        url: fallbackState.linearIssueUrl,
        estimate: fallbackState.estimate,
        completedAt: fallbackState.completedAt,
        canceledAt: fallbackState.canceledAt,
        archivedAt: fallbackState.archivedAt,
        trashed: fallbackState.trashed,
        createdAt: fallbackState.createdAt,
        updatedAt:
          fallbackState.latestLinearUpdatedAt ?? fallbackState.updatedAt,
        state: {
          id: null,
          type: fallbackState.latestLinearStateType,
          name: fallbackState.latestLinearStateName,
        },
        assignee: fallbackState.assigneeLinearId
          ? {
              id: fallbackState.assigneeLinearId,
              email: fallbackState.assigneeEmail,
              name: fallbackState.assigneeName,
              displayName: fallbackState.assigneeName,
            }
          : null,
        labels: fallbackState.hasPptLabel ? [PPT_LABEL] : [],
        comments: [],
        history: [],
      }
    : undefined;
  const snapshot = await fetchIssueSnapshot(issueId, options.userId, fallback);
  return evaluatePptSnapshot(snapshot, options.trigger ?? "manual");
}

export async function shouldEvaluatePptIssueFromWebhook(
  issue: PptWebhookIssue,
) {
  const hinted = issueFromWebhook(issue);
  const previous = await prisma.pptPayoutState.findUnique({
    where: { linearIssueId: hinted.id },
    select: {
      id: true,
      completionEpisode: true,
      transactionId: true,
    },
  });

  return shouldEvaluatePptWebhookHint({
    stateType: hinted.state.type,
    stateName: hinted.state.name,
    canceledAt: hinted.canceledAt,
    archivedAt: hinted.archivedAt,
    trashed: hinted.trashed,
    previousCompletionEpisode: previous?.completionEpisode ?? null,
    previousTransactionId: previous?.transactionId ?? null,
  });
}

export async function evaluatePptIssueFromWebhook(issue: PptWebhookIssue) {
  const hinted = issueFromWebhook(issue);
  const hintedUser = await findLinkedUser(hinted.assignee);
  const snapshot = await fetchIssueSnapshot(issue.id, hintedUser?.id, hinted);
  return evaluatePptSnapshot(snapshot, "webhook");
}

export async function handlePptCommentWebhook(comment: PptWebhookComment) {
  if (!comment.issueId) return null;
  return evaluatePptIssueById(comment.issueId, { trigger: "comment" });
}

async function evaluatePptSnapshot(
  snapshot: LinearIssueSnapshot,
  trigger: PptTrigger,
) {
  const previousState = await findPptState(snapshot.id);
  const linkedUser = await findLinkedUser(snapshot.assignee);
  const isCompleted = snapshot.state.type === "completed";
  const hasPptLabel = issueHasPptLabel(snapshot);
  if (
    snapshot.linearApiError &&
    previousState?.latestLinearUpdatedAt &&
    snapshot.updatedAt &&
    snapshot.updatedAt < previousState.latestLinearUpdatedAt
  ) {
    await appendEvent({
      stateId: previousState.id,
      linearIssueId: snapshot.id,
      type: "STALE_WEBHOOK_SKIPPED",
      reason: "STALE_LINEAR_WEBHOOK",
      metadata: {
        trigger,
        webhookUpdatedAt: snapshot.updatedAt.toISOString(),
        latestLinearUpdatedAt:
          previousState.latestLinearUpdatedAt.toISOString(),
      },
    });
    return {
      status: "SKIPPED" as const,
      reason: "STALE_LINEAR_WEBHOOK" as const,
    };
  }
  if (!hasPptLabel && !previousState) {
    return { status: "SKIPPED" as const };
  }
  const enteredCompleted =
    isCompleted && previousState?.latestLinearStateType !== "completed";
  const reopened =
    !isCompleted && previousState?.latestLinearStateType === "completed";
  const completionEpisode = enteredCompleted
    ? (previousState?.completionEpisode ?? 0) + 1
    : (previousState?.completionEpisode ?? (isCompleted ? 1 : 0));
  const assignmentAt = latestAssignmentAt(snapshot, previousState);
  const assigneeChanged = Boolean(
    previousState?.assigneeLinearId &&
      snapshot.assignee?.id &&
      previousState.assigneeLinearId !== snapshot.assignee.id,
  );
  const estimateChanged = Boolean(
    previousState?.estimate != null &&
      !estimatesMatch(previousState.estimate, snapshot.estimate),
  );
  const mutationAt = snapshot.updatedAt ?? new Date();

  const base = await upsertStateBase(
    snapshot,
    linkedUser?.id ?? null,
    previousState?.status ?? "BLOCKED",
    previousState?.reason ?? null,
    completionEpisode,
    assignmentAt,
    getCompletedAtForState(snapshot, previousState),
    assigneeChanged ? mutationAt : null,
    estimateChanged ? mutationAt : null,
  );

  if (enteredCompleted) {
    await appendEvent({
      stateId: base.id,
      linearIssueId: snapshot.id,
      type: "COMPLETED_DETECTED",
      reason: "READY_FOR_PAYOUT",
      metadata: { trigger, completionEpisode },
    });
  }

  if (!hasPptLabel) {
    await invalidateTrackedIssue({
      snapshot,
      stateId: base.id,
      existingState: previousState,
      userId: linkedUser?.id ?? null,
      reason: "PPT_LABEL_REMOVED",
      processingReason: "PPT_LABEL_REMOVED_DURING_PAYOUT_PROCESSING",
      paidReason: "PAID_ISSUE_LABEL_REMOVED",
      detail:
        "The PPT label was removed, so DevHub stopped automatic payout for this issue.",
    });
    return { status: "BLOCKED" as const, reason: "PPT_LABEL_REMOVED" as const };
  }

  if (isCanceledIssue(snapshot)) {
    await invalidateTrackedIssue({
      snapshot,
      stateId: base.id,
      existingState: previousState,
      userId: linkedUser?.id ?? null,
      reason: "ISSUE_CANCELED",
      processingReason: "ISSUE_CANCELED_DURING_PAYOUT_PROCESSING",
      paidReason: "PAID_ISSUE_CANCELED",
      detail:
        "The Linear issue was canceled, so DevHub stopped automatic payout for this issue.",
    });
    return { status: "BLOCKED" as const, reason: "ISSUE_CANCELED" as const };
  }

  if (isArchivedOrTrashedIssue(snapshot)) {
    await invalidateTrackedIssue({
      snapshot,
      stateId: base.id,
      existingState: previousState,
      userId: linkedUser?.id ?? null,
      reason: "ISSUE_ARCHIVED_OR_TRASHED",
      processingReason: "ISSUE_ARCHIVED_DURING_PAYOUT_PROCESSING",
      paidReason: "PAID_ISSUE_ARCHIVED",
      detail:
        "The Linear issue was archived or moved to trash, so DevHub stopped automatic payout for this issue.",
    });
    return {
      status: "BLOCKED" as const,
      reason: "ISSUE_ARCHIVED_OR_TRASHED" as const,
    };
  }

  if (reopened) {
    await handleReopenedIssue(
      snapshot,
      base.id,
      previousState,
      linkedUser?.id ?? null,
    );
    return { status: "REOPENED" as const };
  }

  if (!isCompleted) {
    await blockPayout(
      snapshot,
      base.id,
      linkedUser?.id ?? null,
      "NOT_COMPLETED",
    );
    return { status: "BLOCKED" as const, reason: "NOT_COMPLETED" as const };
  }
  if (!snapshot.estimate) {
    await blockPayout(
      snapshot,
      base.id,
      linkedUser?.id ?? null,
      "MISSING_ESTIMATE",
    );
    return { status: "BLOCKED" as const, reason: "MISSING_ESTIMATE" as const };
  }
  if (!snapshot.assignee?.id) {
    await blockPayout(snapshot, base.id, null, "MISSING_ASSIGNEE");
    return { status: "BLOCKED" as const, reason: "MISSING_ASSIGNEE" as const };
  }

  const existingTransactionForAssigneeChange =
    assigneeChanged && previousState?.transaction
      ? previousState.transaction
      : assigneeChanged
        ? await prisma.transaction.findUnique({
            where: { linearIssueId: snapshot.id },
            include: { payout: true },
          })
        : null;
  if (
    assigneeChanged &&
    existingTransactionForAssigneeChange &&
    existingTransactionForAssigneeChange.status !== "REJECTED"
  ) {
    await appendEvent({
      stateId: base.id,
      linearIssueId: snapshot.id,
      type: "ASSIGNEE_CHANGED",
      reason: "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
      metadata: {
        previousAssigneeLinearId: previousState?.assigneeLinearId ?? null,
        currentAssigneeLinearId: snapshot.assignee.id,
      },
    });
    await invalidateTrackedIssue({
      snapshot,
      stateId: base.id,
      existingState: previousState,
      userId: linkedUser?.id ?? null,
      reason: "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK",
      processingReason: "ASSIGNEE_CHANGED_DURING_PAYOUT_PROCESSING",
      paidReason: "PAID_ISSUE_REASSIGNED",
      detail:
        "The issue assignee changed after a payout check, so the current assignee must provide fresh proof before payout can resume.",
    });
    return {
      status: "BLOCKED" as const,
      reason: "ASSIGNEE_CHANGED_AFTER_PAYOUT_CHECK" as const,
    };
  }
  if (assigneeChanged) {
    await prisma.pptPayoutState.update({
      where: { id: base.id },
      data: clearProofOverrideData(),
    });
  }

  const estimateChangeResult = await handleEstimateChange(
    snapshot,
    base.id,
    previousState,
    linkedUser?.id ?? null,
    linkedUser ? getCurrencyForPaymentMethod(linkedUser.paymentMethod) : null,
  );
  if (estimateChangeResult === "FLAGGED") {
    return { status: "FLAGGED" as const };
  }

  if (!linkedUser) {
    await blockPayout(snapshot, base.id, null, "NO_LINKED_USER");
    return { status: "BLOCKED" as const, reason: "NO_LINKED_USER" as const };
  }
  if (snapshot.linearApiError) {
    await blockPayout(snapshot, base.id, linkedUser.id, "LINEAR_API_ERROR");
    await notifyAdmins(
      base.id,
      snapshot,
      "LINEAR_API_ERROR",
      snapshot.linearApiError,
    );
    return { status: "BLOCKED" as const, reason: "LINEAR_API_ERROR" as const };
  }

  const overrideActive =
    !assigneeChanged &&
    !estimateChanged &&
    base.proofOverride &&
    base.proofOverrideEpisode === base.completionEpisode;
  if (overrideActive) {
    const proofProvidedAt = base.proofOverrideAt ?? new Date();
    const proofCommentBody = `Admin proof override${
      base.proofOverrideNote ? `: ${base.proofOverrideNote}` : ""
    }`.slice(0, 1000);

    await prisma.pptPayoutState.update({
      where: { id: base.id },
      data: {
        proofProvidedAt,
        proofAuthorLinearId: null,
        proofCommentId: null,
        proofCommentUrl: null,
        proofCommentBody,
      },
    });
    await appendEvent({
      stateId: base.id,
      linearIssueId: snapshot.id,
      type: "PROOF_OVERRIDDEN",
      reason: "READY_FOR_PAYOUT",
      message: "Proof requirement satisfied by admin override",
      metadata: {
        proofOverrideById: base.proofOverrideById,
        proofOverrideAt: proofProvidedAt.toISOString(),
      },
    });

    const currency = getCurrencyForPaymentMethod(linkedUser.paymentMethod);
    const amount = estimateToAmount(snapshot.estimate, currency);
    await handleEligiblePayout(
      snapshot,
      base.id,
      linkedUser.id,
      currency,
      amount,
      null,
    );
    return { status: "READY_FOR_PAYOUT" as const };
  }
  if (
    base.proofOverride &&
    base.proofOverrideEpisode !== base.completionEpisode
  ) {
    await prisma.pptPayoutState.update({
      where: { id: base.id },
      data: clearProofOverrideData(),
    });
  }

  const proof = findQualifyingProof(snapshot, previousState, assignmentAt);
  const resetQuestion = findResetQuestion(snapshot, proof, previousState);
  if (resetQuestion) {
    await blockPayout(
      snapshot,
      base.id,
      linkedUser.id,
      "PROOF_RESET_BY_QUESTION",
      "NEEDS_PROOF",
    );
    await appendEvent({
      stateId: base.id,
      linearIssueId: snapshot.id,
      type: "PROOF_RESET",
      reason: "PROOF_RESET_BY_QUESTION",
      actorLinearId: resetQuestion.userId,
      metadata: { commentId: resetQuestion.id },
    });
    return {
      status: "BLOCKED" as const,
      reason: "PROOF_RESET_BY_QUESTION" as const,
    };
  }

  if (!proof) {
    await blockPayout(
      snapshot,
      base.id,
      linkedUser.id,
      "MISSING_PROOF",
      "NEEDS_PROOF",
      "PROOF_MISSING",
    );
    return { status: "BLOCKED" as const, reason: "MISSING_PROOF" as const };
  }

  await prisma.pptPayoutState.update({
    where: { id: base.id },
    data: {
      proofCommentId: proof.id,
      proofCommentUrl: proof.url,
      proofCommentBody: proof.body.slice(0, 1000),
      proofAuthorLinearId: proof.userId,
      proofProvidedAt: proof.editedAt ?? proof.createdAt,
    },
  });
  await appendEvent({
    stateId: base.id,
    linearIssueId: snapshot.id,
    type: "PROOF_ACCEPTED",
    reason: "READY_FOR_PAYOUT",
    actorLinearId: proof.userId,
    metadata: { commentId: proof.id },
  });
  await notify({
    userId: linkedUser.id,
    domain: "ppt",
    type: "PROOF_ACCEPTED",
    title: snapshot.identifier ?? getIssueTitle(snapshot),
    message:
      "Your proof was accepted. DevHub is checking the stability window.",
    href: `/dashboard/ppts#task-${snapshot.id}`,
    entityType: "ppt_payout_state",
    entityId: base.id,
    payload: {
      stateId: base.id,
      identifier: snapshot.identifier,
      issueTitle: getIssueTitle(snapshot),
      issueUrl: snapshot.url,
    },
    dedupeKey: `ppt:proof-accepted:${linkedUser.id}:${base.id}:${proof.id}`,
    channels: [IN_APP_CHANNEL],
  });
  await awardAchievement(linkedUser.id, "FIRST_PROOF", {
    issueId: snapshot.id,
  });

  const completedAt = base.completedAt ?? snapshot.completedAt ?? new Date();
  const stableAt = new Date(
    completedAt.getTime() + getStabilityMinutes() * 60 * 1000,
  );
  if (stableAt.getTime() > Date.now()) {
    await prisma.pptPayoutState.update({
      where: { id: base.id },
      data: { status: "WAITING_STABILITY", reason: "WAITING_STABILITY" },
    });
    await appendEvent({
      stateId: base.id,
      linearIssueId: snapshot.id,
      type: "WAITING_STABILITY",
      reason: "WAITING_STABILITY",
      metadata: { stableAt: stableAt.toISOString() },
    });
    await notifyDeveloper(
      base.id,
      linkedUser.id,
      snapshot,
      "WAITING_STABILITY",
      "READY",
    );
    return { status: "WAITING_STABILITY" as const, stableAt };
  }

  const currency = getCurrencyForPaymentMethod(linkedUser.paymentMethod);
  const amount = estimateToAmount(snapshot.estimate, currency);
  await prisma.pptPayoutState.update({
    where: { id: base.id },
    data: { status: "READY_FOR_PAYOUT", reason: "READY_FOR_PAYOUT" },
  });
  await appendEvent({
    stateId: base.id,
    linearIssueId: snapshot.id,
    type: "PAYOUT_READY",
    reason: "READY_FOR_PAYOUT",
  });
  await handleEligiblePayout(
    snapshot,
    base.id,
    linkedUser.id,
    currency,
    amount,
    proof,
  );

  return { status: "READY_FOR_PAYOUT" as const };
}

export async function postPptProofComment({
  userId,
  issueId,
  body,
}: {
  userId: string;
  issueId: string;
  body: string;
}) {
  const trimmedBody = body.trim();
  if (trimmedBody.length < 20) {
    return {
      error: "Proof is too short. Include what changed and where to verify it.",
    };
  }

  const client = await getLinearClient(userId);
  const normalizedBody = trimmedBody.toLowerCase().includes(PROOF_TAG)
    ? trimmedBody
    : `${PROOF_TAG}\n\n${trimmedBody}`;

  await client.createComment({ issueId, body: normalizedBody });
  await evaluatePptIssueById(issueId, { userId, trigger: "proof_submission" });
  return { success: true };
}

export async function runPptStabilityChecks() {
  const cutoff = new Date(Date.now() - getStabilityMinutes() * 60 * 1000);
  const states = await prisma.pptPayoutState.findMany({
    where: {
      status: "WAITING_STABILITY",
      completedAt: { lte: cutoff },
    },
    select: { linearIssueId: true, userId: true },
    take: 50,
  });

  let checked = 0;
  for (const state of states) {
    await evaluatePptIssueById(state.linearIssueId, {
      userId: state.userId,
      trigger: "stability_cron",
    });
    checked++;
  }
  return checked;
}

export async function sendPptAdminDigest() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await prisma.pptPayoutEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { type: true },
  });
  if (events.length === 0) return 0;

  const blockedCount = events.filter((event) =>
    ["PAYOUT_BLOCKED", "PROOF_MISSING", "PROOF_RESET"].includes(event.type),
  ).length;
  const readyCount = events.filter((event) =>
    ["PAYOUT_READY", "TRANSACTION_CREATED", "AUTO_PAYOUT_STARTED"].includes(
      event.type,
    ),
  ).length;
  const heldCount = events.filter((event) =>
    [
      "REOPENED_DETECTED",
      "ISSUE_INVALIDATED",
      "PAYOUT_HELD",
      "PAID_ISSUE_REOPENED",
      "PAID_ISSUE_MUTATED",
    ].includes(event.type),
  ).length;

  const { default: PptPayoutAdminDigest } = await import(
    "@/emails/PptPayoutAdminDigest"
  );
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true } } },
  });

  let sent = 0;
  const digestDay = new Date().toISOString().slice(0, 10);
  for (const admin of admins) {
    if (!admin.user.email) continue;
    await notify({
      userId: admin.id,
      domain: "ppt",
      type: "ADMIN_DIGEST",
      title: "Daily PPT payout digest",
      message: `${events.length} PPT payout event(s) in the last 24 hours.`,
      href: "/dashboard/admin",
      entityType: "ppt_admin_digest",
      entityId: digestDay,
      dedupeKey: `ppt:admin-digest:${admin.id}:${digestDay}`,
      channels: [EMAIL_CHANNEL],
      email: {
        to: admin.user.email,
        subject: "Daily PPT payout digest - MYSverse DevHub",
        category: "ppt_admin_digest",
        idempotencyKey: `ppt:admin-digest:${digestDay}`,
        react: createElement(PptPayoutAdminDigest, {
          eventCount: events.length,
          blockedCount,
          readyCount,
          heldCount,
        }),
      },
    });
    sent++;
  }
  return sent;
}
