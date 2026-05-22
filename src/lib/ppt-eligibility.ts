import type { Prisma } from "@prisma/client";
import { createElement } from "react";
import PptPayoutAdminAlert from "@/emails/PptPayoutAdminAlert";
import PptPayoutBlocked from "@/emails/PptPayoutBlocked";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { isWithinCreditLimit } from "@/lib/credit-limit";
import {
  type CurrencyCode,
  estimateToAmount,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { sendEmail } from "@/lib/email";
import {
  getLinearClient,
  getLinearServiceClient,
  LinearReauthRequiredError,
} from "@/lib/linear";
import { initiateAutoPayout } from "@/lib/payout";
import prisma from "@/lib/prisma";

const PPT_LABEL = "PPT";
const PROOF_TAG = "#ppt-proof";
const DEVELOPER_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const PROOF_LOOKBACK_DAYS = 7;

type PptReason =
  | "MISSING_PPT_LABEL"
  | "NOT_COMPLETED"
  | "MISSING_ESTIMATE"
  | "MISSING_ASSIGNEE"
  | "NO_LINKED_USER"
  | "MISSING_PROOF"
  | "PROOF_RESET_BY_QUESTION"
  | "WAITING_STABILITY"
  | "DUPLICATE_TRANSACTION"
  | "APPROVED_BONUS_EXISTS"
  | "LINEAR_API_ERROR"
  | "REOPENED_BEFORE_PAYOUT"
  | "REOPENED_DURING_PAYOUT_PROCESSING"
  | "PAID_ISSUE_REOPENED"
  | "READY_FOR_PAYOUT"
  | "TRANSACTION_CREATED"
  | "AUTO_PAYOUT_STARTED";

type PptStatus =
  | "BLOCKED"
  | "NEEDS_PROOF"
  | "WAITING_STABILITY"
  | "READY_FOR_PAYOUT"
  | "TRANSACTION_PENDING"
  | "ON_HOLD"
  | "PAID"
  | "FLAGGED";

type PptEventType =
  | "COMPLETED_DETECTED"
  | "REOPENED_DETECTED"
  | "PROOF_MISSING"
  | "PROOF_ACCEPTED"
  | "PROOF_RESET"
  | "WAITING_STABILITY"
  | "PAYOUT_BLOCKED"
  | "PAYOUT_HELD"
  | "PAYOUT_RESUMED"
  | "PAYOUT_READY"
  | "TRANSACTION_CREATED"
  | "AUTO_PAYOUT_STARTED"
  | "PAID_ISSUE_REOPENED"
  | "DUPLICATE_SUPPRESSED"
  | "LINEAR_COMMENTED"
  | "DEVELOPER_NOTIFIED"
  | "ADMIN_ALERT_SENT";

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
  const configured = Number(process.env.PPT_STABILITY_MINUTES ?? "60");
  if (!Number.isFinite(configured) || configured < 0) return 60;
  return configured;
}

function getIssueTitle(snapshot: LinearIssueSnapshot) {
  return snapshot.title || snapshot.identifier || "PPT task";
}

function formatReason(reason: PptReason | null | undefined) {
  const copy: Record<PptReason, string> = {
    MISSING_PPT_LABEL: "The issue does not have the PPT label.",
    NOT_COMPLETED: "The issue is not currently in a completed Linear state.",
    MISSING_ESTIMATE: "The issue does not have a complexity estimate.",
    MISSING_ASSIGNEE: "The issue is not assigned to a developer.",
    NO_LINKED_USER:
      "The Linear assignee is not linked to a DevHub developer profile.",
    MISSING_PROOF: "A recent #ppt-proof comment from the assignee is required.",
    PROOF_RESET_BY_QUESTION:
      "A follow-up question was asked after completion, so fresh proof is required.",
    WAITING_STABILITY:
      "The task needs to remain completed for the payout stability window.",
    DUPLICATE_TRANSACTION:
      "A payout transaction already exists for this Linear issue.",
    APPROVED_BONUS_EXISTS:
      "This issue already has an approved bonus payout candidate.",
    LINEAR_API_ERROR:
      "DevHub could not verify the latest Linear comments or history.",
    REOPENED_BEFORE_PAYOUT:
      "The issue was moved out of Done before payout was released.",
    REOPENED_DURING_PAYOUT_PROCESSING:
      "The issue reopened while a payout provider was already processing payment.",
    PAID_ISSUE_REOPENED:
      "The issue reopened after DevHub had already marked the payout paid.",
    READY_FOR_PAYOUT: "The issue is ready for payout.",
    TRANSACTION_CREATED: "A payout transaction was created.",
    AUTO_PAYOUT_STARTED: "Automatic payout was started.",
  };
  return reason ? copy[reason] : "PPT payout eligibility changed.";
}

function getActionForReason(reason: PptReason | null | undefined) {
  if (reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION") {
    return "Reply in Linear or use DevHub with #ppt-proof, what changed, proof links/screenshots, where it is implemented, and verification notes.";
  }
  if (reason === "WAITING_STABILITY") {
    return `Keep the issue in Done for ${getStabilityMinutes()} minutes. DevHub will check again automatically.`;
  }
  if (reason === "REOPENED_BEFORE_PAYOUT") {
    return "Move the issue back to Done only when it is truly complete, then submit fresh #ppt-proof.";
  }
  if (reason === "NO_LINKED_USER") {
    return "Link your Linear account in DevHub settings or contact an admin.";
  }
  if (reason === "MISSING_ESTIMATE") {
    return "Ask an admin or task owner to add the Linear estimate.";
  }
  return "Open the task and follow the DevHub payout guidance.";
}

function makeGuidanceComment(reason: PptReason, snapshot: LinearIssueSnapshot) {
  return [
    "DevHub payout check",
    "",
    `Status: ${formatReason(reason)}`,
    "",
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
    snapshot.url
      ? `[Open in DevHub](${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
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

function issueFromWebhook(issue: PptWebhookIssue): LinearIssueSnapshot {
  return {
    id: issue.id,
    identifier: issue.identifier ?? null,
    title: issue.title ?? null,
    url: issue.url ?? null,
    estimate: issue.estimate ?? null,
    completedAt: coerceDate(issue.completedAt),
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
      estimate: issue.estimate ?? null,
      completedAt: issue.completedAt ?? null,
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

  return (
    latestHistory?.createdAt ??
    state?.latestAssignmentAt ??
    snapshot.createdAt ??
    new Date(0)
  );
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
) {
  const assigneeId = snapshot.assignee?.id;
  const proofAt = proof ? (proof.editedAt ?? proof.createdAt) : null;
  const completedAt = snapshot.completedAt ?? new Date(0);

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
      hasPptLabel: snapshot.labels.some(
        (label) => label.toUpperCase() === PPT_LABEL,
      ),
      estimate: snapshot.estimate,
      userId,
      assigneeLinearId: snapshot.assignee?.id ?? null,
      assigneeEmail: snapshot.assignee?.email ?? null,
      assigneeName:
        snapshot.assignee?.displayName ?? snapshot.assignee?.name ?? null,
      status,
      reason,
      completionEpisode,
      completedAt: snapshot.completedAt,
      latestAssignmentAt: assignmentAt,
    },
    update: {
      linearIssueIdentifier: snapshot.identifier,
      linearIssueTitle: snapshot.title,
      linearIssueUrl: snapshot.url,
      latestLinearStateType: snapshot.state.type,
      latestLinearStateName: snapshot.state.name,
      hasPptLabel: snapshot.labels.some(
        (label) => label.toUpperCase() === PPT_LABEL,
      ),
      estimate: snapshot.estimate,
      userId,
      assigneeLinearId: snapshot.assignee?.id ?? null,
      assigneeEmail: snapshot.assignee?.email ?? null,
      assigneeName:
        snapshot.assignee?.displayName ?? snapshot.assignee?.name ?? null,
      status,
      reason,
      completionEpisode,
      completedAt: snapshot.completedAt,
      latestAssignmentAt: assignmentAt,
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

async function createPptNotification(
  userId: string | null | undefined,
  stateId: string,
  type: "BLOCKED" | "HELD" | "READY" | "PROOF_ACCEPTED" | "PAID_REOPENED",
  title: string,
  message: string,
) {
  if (!userId) return;
  await prisma.pptNotification.create({
    data: { userId, stateId, type, title, message },
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

  await createPptNotification(userId, stateId, type, title, message);

  if (state?.user?.user.email) {
    try {
      await sendEmail({
        to: state.user.user.email,
        subject: `PPT payout update: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
        react: createElement(PptPayoutBlocked, {
          userName: state.user.legalName || state.user.user.name || "developer",
          issueIdentifier: snapshot.identifier,
          issueTitle: getIssueTitle(snapshot),
          issueUrl: snapshot.url,
          reason: formatReason(reason),
          action: getActionForReason(reason),
        }),
      });
    } catch (error) {
      console.error("[ppt-eligibility] Failed to email developer:", error);
    }
  }

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
  const state = await prisma.pptPayoutState.findUnique({
    where: { id: stateId },
    include: { user: { include: { user: { select: { name: true } } } } },
  });
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true, name: true } } },
  });

  for (const admin of admins) {
    if (!admin.user.email) continue;
    try {
      await sendEmail({
        to: admin.user.email,
        subject: `PPT payout alert: ${snapshot.identifier ?? getIssueTitle(snapshot)}`,
        react: createElement(PptPayoutAdminAlert, {
          issueIdentifier: snapshot.identifier,
          issueTitle: getIssueTitle(snapshot),
          developerName:
            state?.user?.legalName ||
            state?.user?.user.name ||
            snapshot.assignee?.displayName ||
            snapshot.assignee?.name,
          reason: formatReason(reason),
          detail,
        }),
      });
    } catch (error) {
      console.error("[ppt-eligibility] Failed to email admin:", error);
    }
  }

  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: { lastAdminNotifiedAt: new Date() },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "ADMIN_ALERT_SENT",
    reason,
    message: detail,
  });
}

async function commentGuidanceIfNeeded(
  stateId: string,
  snapshot: LinearIssueSnapshot,
  reason: PptReason,
) {
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
  await prisma.pptPayoutState.update({
    where: { id: stateId },
    data: {
      status,
      reason,
      warningCount: { increment: 1 },
      proofCommentId:
        reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION"
          ? null
          : undefined,
      proofCommentUrl:
        reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION"
          ? null
          : undefined,
      proofCommentBody:
        reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION"
          ? null
          : undefined,
      proofAuthorLinearId:
        reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION"
          ? null
          : undefined,
      proofProvidedAt:
        reason === "MISSING_PROOF" || reason === "PROOF_RESET_BY_QUESTION"
          ? null
          : undefined,
    },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: eventType,
    reason,
    message: formatReason(reason),
  });

  await notifyDeveloper(
    stateId,
    userId,
    snapshot,
    reason,
    status === "ON_HOLD" ? "HELD" : "BLOCKED",
  );
  await commentGuidanceIfNeeded(stateId, snapshot, reason);
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
      proofCommentId: null,
      proofCommentUrl: null,
      proofCommentBody: null,
      proofAuthorLinearId: null,
      proofProvidedAt: null,
    },
  });
  await appendEvent({
    stateId,
    linearIssueId: snapshot.id,
    type: "REOPENED_DETECTED",
    reason: "REOPENED_BEFORE_PAYOUT",
  });

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

  if (
    existingTransaction.payout &&
    ["PENDING", "PROCESSING"].includes(existingTransaction.payout.status)
  ) {
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

async function handleEligiblePayout(
  snapshot: LinearIssueSnapshot,
  stateId: string,
  userId: string,
  currency: CurrencyCode,
  amount: number,
  proof: LinearCommentSnapshot,
) {
  const existing = await prisma.transaction.findUnique({
    where: { linearIssueId: snapshot.id },
    include: { payout: true },
  });

  if (existing && ["PENDING", "PAID"].includes(existing.status)) {
    await prisma.pptPayoutState.update({
      where: { id: stateId },
      data: {
        status: existing.status === "PAID" ? "PAID" : "TRANSACTION_PENDING",
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
          proofCommentId: proof.id,
          proofCommentUrl: proof.url,
          proofCommentBody: proof.body.slice(0, 1000),
          proofAuthorLinearId: proof.userId,
          proofProvidedAt: proof.editedAt ?? proof.createdAt,
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
            proofCommentId: proof.id,
            proofCommentUrl: proof.url,
            proofCommentBody: proof.body.slice(0, 1000),
            proofAuthorLinearId: proof.userId,
            proofProvidedAt: proof.editedAt ?? proof.createdAt,
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
              duplicate.status === "PAID" ? "PAID" : "TRANSACTION_PENDING",
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

  await createPptNotification(
    userId,
    stateId,
    "READY",
    snapshot.identifier ?? getIssueTitle(snapshot),
    "Your PPT payout is ready and has been sent to the payout queue.",
  );

  if (withinLimit) {
    try {
      const payout = await initiateAutoPayout(transactionId);
      await appendEvent({
        stateId,
        linearIssueId: snapshot.id,
        type: "AUTO_PAYOUT_STARTED",
        reason: "AUTO_PAYOUT_STARTED",
        metadata: payout ? { payoutId: payout.id } : { payoutId: null },
      });
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
  options: { userId?: string | null; trigger?: string } = {},
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
        createdAt: fallbackState.createdAt,
        updatedAt: fallbackState.updatedAt,
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
  trigger: string,
) {
  const previousState = await findPptState(snapshot.id);
  const linkedUser = await findLinkedUser(snapshot.assignee);
  const isCompleted = snapshot.state.type === "completed";
  const hasPptLabel = snapshot.labels.some(
    (label) => label.toUpperCase() === PPT_LABEL,
  );
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

  const base = await upsertStateBase(
    snapshot,
    linkedUser?.id ?? null,
    previousState?.status ?? "BLOCKED",
    previousState?.reason ?? null,
    completionEpisode,
    assignmentAt,
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

  if (reopened) {
    await handleReopenedIssue(
      snapshot,
      base.id,
      previousState,
      linkedUser?.id ?? null,
    );
    return { status: "REOPENED" as const };
  }

  if (!hasPptLabel) {
    await blockPayout(
      snapshot,
      base.id,
      linkedUser?.id ?? null,
      "MISSING_PPT_LABEL",
    );
    return { status: "BLOCKED" as const, reason: "MISSING_PPT_LABEL" as const };
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

  const proof = findQualifyingProof(snapshot, previousState, assignmentAt);
  const resetQuestion = findResetQuestion(snapshot, proof);
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
  await createPptNotification(
    linkedUser.id,
    base.id,
    "PROOF_ACCEPTED",
    snapshot.identifier ?? getIssueTitle(snapshot),
    "Your proof was accepted. DevHub is checking the stability window.",
  );

  const completedAt = snapshot.completedAt ?? new Date();
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
    ["REOPENED_DETECTED", "PAYOUT_HELD", "PAID_ISSUE_REOPENED"].includes(
      event.type,
    ),
  ).length;

  const { default: PptPayoutAdminDigest } = await import(
    "@/emails/PptPayoutAdminDigest"
  );
  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    include: { user: { select: { email: true } } },
  });

  let sent = 0;
  for (const admin of admins) {
    if (!admin.user.email) continue;
    await sendEmail({
      to: admin.user.email,
      subject: "Daily PPT payout digest - MYSverse DevHub",
      react: createElement(PptPayoutAdminDigest, {
        eventCount: events.length,
        blockedCount,
        readyCount,
        heldCount,
      }),
    });
    sent++;
  }
  return sent;
}
