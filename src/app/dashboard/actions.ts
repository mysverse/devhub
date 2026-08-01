"use server";

import type { PptSelfBlockReason } from "@prisma/client";
import { revalidatePath, updateTag } from "next/cache";
import { awardAchievement, markAchievementsSeen } from "@/lib/achievements";
import { getSession } from "@/lib/auth-utils";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { getLinearClient, LinearReauthRequiredError } from "@/lib/linear";
import { describeLinearMutationError } from "@/lib/linear-error";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import {
  appendWatchEvent,
  broadcastTaskAvailable,
  recordEagerClaim,
  recordTakeoverAway,
} from "@/lib/ppt-assignment-watch";
import prisma from "@/lib/prisma";

function revalidateBoards(viewerLinearId: string) {
  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard");
  updateTag(TAGS.workspacePpts);
  updateTag(TAGS.userIssues(viewerLinearId));
}

export async function claimIssue(
  issueId: string,
  options?: { takeoverReason?: string },
) {
  const { userId, user } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    const linearClient = await getLinearClient(userId);
    const viewer = await linearClient.viewer;

    const [issue] = await fetchIssuesByIds(linearClient, [issueId]);
    if (!issue) {
      return {
        error:
          "This task no longer exists in Linear. Refresh the board and try again.",
      };
    }

    const previousAssignee =
      issue.assignee && issue.assignee.id !== viewer.id ? issue.assignee : null;
    const takeoverReason = options?.takeoverReason?.trim() ?? "";
    if (previousAssignee && takeoverReason.length < 10) {
      return {
        error:
          "Add a short reason for the takeover (at least 10 characters) — the previous assignee will be notified with it.",
      };
    }

    await linearClient.updateIssue(issueId, {
      assigneeId: viewer.id,
    });

    const issueRef = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
    };
    await recordEagerClaim({
      issue: issueRef,
      userId,
      assigneeLinearId: viewer.id,
      takeover: previousAssignee
        ? {
            reason: takeoverReason,
            previousAssigneeLinearId: previousAssignee.id,
          }
        : null,
    });
    await awardAchievement(userId, "FIRST_CLAIM", { issueId: issue.id });
    if (previousAssignee) {
      await recordTakeoverAway({
        issue: issueRef,
        previousAssigneeLinearId: previousAssignee.id,
        takenByUserId: userId,
        takenByName: user?.name ?? viewer.displayName ?? "Another developer",
        reason: takeoverReason,
      });
    }

    revalidateBoards(viewer.id);

    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    console.error("Failed to claim issue:", e);
    return {
      error: describeLinearMutationError(
        e,
        "Couldn't claim the task — it may have been claimed just now. Refresh and try again.",
      ),
    };
  }
}

/**
 * One-click self-unassign, framed as a positive action: the task returns to
 * the board and developers with capacity get a heads-up.
 */
export async function releaseIssue(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  try {
    const linearClient = await getLinearClient(userId);
    const viewer = await linearClient.viewer;

    const [issue] = await fetchIssuesByIds(linearClient, [issueId]);
    if (!issue) {
      return { error: "This task no longer exists in Linear." };
    }
    if (!issue.assignee || issue.assignee.id !== viewer.id) {
      return { error: "You can only release tasks assigned to you." };
    }

    await linearClient.updateIssue(issueId, { assigneeId: null });

    const watch = await prisma.pptAssignmentWatch.findUnique({
      where: {
        linearIssueId_assigneeLinearId: {
          linearIssueId: issueId,
          assigneeLinearId: viewer.id,
        },
      },
    });
    if (watch) {
      await prisma.pptAssignmentWatch.update({
        where: { id: watch.id },
        data: { status: "RESOLVED", releasedBySelfAt: new Date() },
      });
      await appendWatchEvent({
        watchId: watch.id,
        linearIssueId: issueId,
        type: "RELEASED",
        actorUserId: userId,
      });
    }
    await broadcastTaskAvailable({
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      },
      excludeUserId: userId,
      context: "released",
    });

    revalidateBoards(viewer.id);

    return { success: true };
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return { error: "reauth_required", reauth: true };
    }
    console.error("Failed to release issue:", e);
    return {
      error: describeLinearMutationError(
        e,
        "Couldn't release the task right now. Try again in a moment.",
      ),
    };
  }
}

/**
 * Self-service "I'm blocked": pauses the activity timer for a time-boxed
 * window without requiring filler Linear comments. Repeated blocks on the
 * same assignment are surfaced to admins so they can help unblock.
 */
export async function markTaskBlocked(
  issueId: string,
  reason: PptSelfBlockReason,
  note?: string,
) {
  const { userId, user } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const watch = await prisma.pptAssignmentWatch.findFirst({
    where: {
      linearIssueId: issueId,
      userId,
      status: { in: ["ACTIVE", "WARNED", "BLOCKED"] },
    },
  });
  if (!watch) {
    return { error: "You don't have an active claim on this task." };
  }

  const policy = getResolvedPayoutPolicy();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + policy.selfBlockHours * 60 * 60 * 1000,
  );
  const trimmedNote = note?.trim() || null;
  const updated = await prisma.pptAssignmentWatch.update({
    where: { id: watch.id },
    data: {
      status: "BLOCKED",
      selfBlockedAt: now,
      selfBlockReason: reason,
      selfBlockNote: trimmedNote,
      selfBlockExpiresAt: expiresAt,
      selfBlockCount: { increment: 1 },
    },
  });
  await appendWatchEvent({
    watchId: watch.id,
    linearIssueId: issueId,
    type: "BLOCKED",
    actorUserId: userId,
    note: trimmedNote ?? reason,
  });

  if (updated.selfBlockCount >= 2) {
    const admins = await prisma.userProfile.findMany({
      where: ADMIN_ACCESS_WHERE,
      select: { id: true },
    });
    const label =
      watch.linearIssueIdentifier ?? watch.linearIssueTitle ?? issueId;
    await Promise.all(
      admins.map((admin) =>
        notify({
          userId: admin.id,
          domain: "ppt_task",
          type: "BLOCKED_REPORTED",
          title: `Repeatedly blocked PPT: ${label}`,
          message: `${user?.name ?? "A developer"} marked this task blocked ${updated.selfBlockCount} times (${reason.replaceAll("_", " ").toLowerCase()}${trimmedNote ? `: ${trimmedNote}` : ""}). They may need help unblocking.`,
          href: "/dashboard/admin",
          entityType: "linear_issue",
          entityId: issueId,
          dedupeKey: `ppt-task:blocked-reported:${admin.id}:${watch.id}:${updated.selfBlockCount}`,
          channels: [IN_APP_CHANNEL],
        }),
      ),
    );
  }

  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard");

  return { success: true, expiresAt: expiresAt.toISOString() };
}

export async function markMyAchievementsSeen() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };
  await markAchievementsSeen(userId);
  return { success: true };
}

export async function dismissGettingStarted() {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };
  await prisma.userProfile.update({
    where: { id: userId },
    data: { gettingStartedDismissedAt: new Date() },
  });
  revalidatePath("/dashboard");
  return { success: true };
}

export async function markTaskUnblocked(issueId: string) {
  const { userId } = await getSession();
  if (!userId) return { error: "Unauthorized" };

  const watch = await prisma.pptAssignmentWatch.findFirst({
    where: { linearIssueId: issueId, userId, status: "BLOCKED" },
  });
  if (!watch) {
    return { error: "This task isn't marked blocked." };
  }

  await prisma.pptAssignmentWatch.update({
    where: { id: watch.id },
    data: {
      status: "ACTIVE",
      lastActivityAt: new Date(),
      selfBlockedAt: null,
      selfBlockReason: null,
      selfBlockNote: null,
      selfBlockExpiresAt: null,
    },
  });
  await appendWatchEvent({
    watchId: watch.id,
    linearIssueId: issueId,
    type: "UNBLOCKED",
    actorUserId: userId,
  });

  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard");

  return { success: true };
}
