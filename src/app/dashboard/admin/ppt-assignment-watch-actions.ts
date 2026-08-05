"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { getLinearServiceClient } from "@/lib/linear";
import {
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notifyWithPreferences,
} from "@/lib/notifications";
import {
  appendWatchEvent,
  DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER,
  getSnoozeHours,
} from "@/lib/ppt-assignment-watch";
import prisma from "@/lib/prisma";
import { USER_IDENTITY_SELECT } from "@/lib/prisma-select";

function cleanNote(note: string) {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("A note is required for this action.");
  }
  return trimmed.slice(0, 1000);
}

function issueLabel(watch: {
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
}) {
  return watch.linearIssueIdentifier
    ? `${watch.linearIssueIdentifier} - ${watch.linearIssueTitle ?? "PPT task"}`
    : (watch.linearIssueTitle ?? "PPT task");
}

function revalidateWatchSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard/admin");
}

async function loadWatch(id: string) {
  return prisma.pptAssignmentWatch.findUnique({
    where: { id },
    include: {
      user: { include: { user: { select: USER_IDENTITY_SELECT } } },
    },
  });
}

export async function snoozePptAssignmentWatch(id: string, note: string) {
  try {
    const adminId = await requireAdmin();
    const adminNote = cleanNote(note);
    const watch = await loadWatch(id);
    if (!watch) return { error: "Assignment watch not found." };
    if (watch.status === "UNASSIGNED" || watch.status === "RESOLVED") {
      return { error: "Only active watched assignments can be snoozed." };
    }

    const now = new Date();
    const snoozedUntil = new Date(
      now.getTime() + getSnoozeHours() * 60 * 60 * 1000,
    );
    await prisma.pptAssignmentWatch.update({
      where: { id },
      data: {
        status: "SNOOZED",
        snoozedUntil,
        snoozeReason: adminNote,
        lastAdminActionAt: now,
        lastAdminActionById: adminId,
        lastAdminActionNote: adminNote,
      },
    });
    await appendWatchEvent({
      watchId: watch.id,
      linearIssueId: watch.linearIssueId,
      type: "ADMIN_SNOOZE",
      actorUserId: adminId,
      note: adminNote,
    });
    revalidateWatchSurfaces();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to snooze assignment watch.",
    };
  }
}

export async function markPptAssignmentWatchActive(id: string, note: string) {
  try {
    const adminId = await requireAdmin();
    const adminNote = cleanNote(note);
    const watch = await loadWatch(id);
    if (!watch) return { error: "Assignment watch not found." };
    if (watch.status === "UNASSIGNED" || watch.status === "RESOLVED") {
      return { error: "Released or resolved watches cannot be marked active." };
    }

    const now = new Date();
    await prisma.pptAssignmentWatch.update({
      where: { id },
      data: {
        status: "ACTIVE",
        lastActivityAt: now,
        warnedAt: null,
        snoozedUntil: null,
        snoozeReason: null,
        selfBlockedAt: null,
        selfBlockReason: null,
        selfBlockNote: null,
        selfBlockExpiresAt: null,
        lastAdminActionAt: now,
        lastAdminActionById: adminId,
        lastAdminActionNote: adminNote,
      },
    });
    await appendWatchEvent({
      watchId: watch.id,
      linearIssueId: watch.linearIssueId,
      type: "ADMIN_ACTIVATE",
      actorUserId: adminId,
      note: adminNote,
    });
    revalidateWatchSurfaces();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark assignment active.",
    };
  }
}

export async function forceUnassignPptAssignmentWatch(
  id: string,
  note: string,
) {
  try {
    const adminId = await requireAdmin();
    const adminNote = cleanNote(note);
    const watch = await loadWatch(id);
    if (!watch) return { error: "Assignment watch not found." };
    if (watch.status === "UNASSIGNED") {
      return { error: "This assignment is already unassigned." };
    }
    if (watch.status === "RESOLVED") {
      return { error: "Resolved watches cannot be force-unassigned." };
    }

    const client = getLinearServiceClient();
    if (!client) {
      return { error: "LINEAR_SERVICE_API_KEY is required to unassign." };
    }

    const now = new Date();
    await client.updateIssue(watch.linearIssueId, { assigneeId: null });
    await client.createComment({
      issueId: watch.linearIssueId,
      body: `${DEVHUB_ASSIGNMENT_WATCH_COMMENT_MARKER}
DevHub manually unassigned this PPT so another developer can claim it.

Admin note: ${adminNote}`,
    });

    if (watch.userId) {
      await notifyWithPreferences({
        userId: watch.userId,
        actorId: adminId,
        domain: "ppt_task",
        type: "AUTO_UNASSIGNED",
        title: `PPT unassigned: ${watch.linearIssueIdentifier ?? watch.linearIssueTitle ?? "task"}`,
        message:
          "An admin unassigned this stale PPT so another developer can claim it.",
        href: "/dashboard/ppts",
        entityType: "linear_issue",
        entityId: watch.linearIssueId,
        payload: {
          issueId: watch.linearIssueId,
          issueUrl: watch.linearIssueUrl ?? null,
          note: adminNote,
          manual: true,
        },
        dedupeKey: `ppt-task:manual-unassigned:${watch.id}:${now.getTime()}`,
        channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
        email: watch.user?.user.email
          ? {
              to: watch.user.user.email,
              subject: `PPT manually unassigned: ${issueLabel(watch)}`,
              category: "ppt_task_manual_unassigned",
              idempotencyKey: `ppt-task:manual-unassigned:${watch.id}:${now.getTime()}`,
            }
          : undefined,
      });
    }

    await prisma.pptAssignmentWatch.update({
      where: { id },
      data: {
        status: "UNASSIGNED",
        unassignedAt: now,
        lastLinearCommentAt: now,
        lastLinearCommentType: "manual_unassigned",
        lastAdminActionAt: now,
        lastAdminActionById: adminId,
        lastAdminActionNote: adminNote,
      },
    });
    await appendWatchEvent({
      watchId: watch.id,
      linearIssueId: watch.linearIssueId,
      type: "ADMIN_FORCE_UNASSIGN",
      actorUserId: adminId,
      note: adminNote,
    });
    revalidateWatchSurfaces();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to force-unassign assignment watch.",
    };
  }
}
