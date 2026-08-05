"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createElement } from "react";
import PptRequestApproved from "@/emails/PptRequestApproved";
import PptRequestRejected from "@/emails/PptRequestRejected";
import { requireAdmin } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import {
  complexityLevelToLinearEstimate,
  estimateToAmount,
  formatAmount,
} from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { findTodoWorkflowStateId } from "@/lib/linear-queries";
import {
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notifyWithPreferences,
} from "@/lib/notifications";
import { DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER } from "@/lib/ppt-request-marker";
import prisma from "@/lib/prisma";

export type PptApprovalAssigneeTarget =
  | { type: "requester" }
  | { type: "linear_user"; linearId: string; name?: string | null }
  | { type: "open" }
  | { type: "keep_existing" };

function attachmentMarkdown(
  attachments: { filename: string; mimeType: string; linearAssetUrl: string }[],
) {
  if (attachments.length === 0) return "";
  const lines = ["## Attachments", ""];
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      lines.push(`![${attachment.filename}](${attachment.linearAssetUrl})`);
    } else {
      lines.push(`- [${attachment.filename}](${attachment.linearAssetUrl})`);
    }
  }
  return lines.join("\n");
}

function approvedIssueDescription(request: {
  description: string | null;
  note: string | null;
  attachments: { filename: string; mimeType: string; linearAssetUrl: string }[];
}) {
  const parts = [
    request.description?.trim(),
    attachmentMarkdown(request.attachments),
    request.note ? `## Request note\n\n${request.note.trim()}` : null,
    // No requester name: this description is permanent and visible to the whole
    // Linear workspace, and Linear already records the creator, the assignee
    // and the DevHub link. The sibling approvalComment() below has always
    // omitted it.
    `---\n${DEVHUB_PPT_REQUEST_DESCRIPTION_MARKER}\nCreated from a DevHub PPT request.`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

function approvalComment(request: {
  linearIssueTitle: string;
  requestedEstimate: number;
  projectedDueDate: Date;
  description: string | null;
  note: string | null;
  attachments: { filename: string; mimeType: string; linearAssetUrl: string }[];
}) {
  const parts = [
    "DevHub PPT request approved",
    "",
    `Complexity: ${request.requestedEstimate}`,
    `Projected due: ${request.projectedDueDate.toISOString().slice(0, 10)}`,
    request.description
      ? `\n## Request description\n\n${request.description}`
      : null,
    request.note ? `\n## Request note\n\n${request.note}` : null,
    attachmentMarkdown(request.attachments),
  ];
  return parts.filter(Boolean).join("\n");
}

async function notifyOpenPptAvailable({
  requesterId,
  actorId,
  issueIdentifier,
  issueTitle,
  issueUrl,
}: {
  requesterId: string;
  actorId: string;
  issueIdentifier: string | null | undefined;
  issueTitle: string;
  issueUrl: string | null | undefined;
}) {
  const users = await prisma.userProfile.findMany({
    where: {
      id: { not: requesterId },
      linearId: { not: null },
      role: "DEVELOPER",
    },
    include: { user: { select: { email: true } } },
  });

  for (const user of users) {
    await notifyWithPreferences({
      userId: user.id,
      actorId,
      domain: "ppt_task",
      type: "UNCLAIMED_AVAILABLE",
      title: issueIdentifier
        ? `New PPT available: ${issueIdentifier}`
        : "New PPT task available",
      message: `${issueTitle} is open to claim on the PPT board.`,
      href: "/dashboard/ppts",
      entityType: "linear_issue",
      entityId: issueIdentifier ?? issueTitle,
      payload: { issueIdentifier, issueTitle, issueUrl },
      dedupeKey: `ppt-task:unclaimed:${user.id}:${issueIdentifier ?? issueTitle}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: user.user.email
        ? {
            to: user.user.email,
            subject: `New unclaimed PPT task: ${issueTitle}`,
            category: "ppt_task_unclaimed_available",
            idempotencyKey: `ppt-task:unclaimed:${issueIdentifier ?? issueTitle}:${user.id}`,
          }
        : undefined,
    });
  }
}

async function notifyAssignedPpt({
  assigneeLinearId,
  requesterId,
  actorId,
  issueIdentifier,
  issueTitle,
  issueUrl,
}: {
  assigneeLinearId: string;
  requesterId: string;
  actorId: string;
  issueIdentifier: string | null | undefined;
  issueTitle: string;
  issueUrl: string | null | undefined;
}) {
  const assignee = await prisma.userProfile.findUnique({
    where: { linearId: assigneeLinearId },
    include: { user: { select: { email: true } } },
  });
  if (!assignee || assignee.id === requesterId) return;

  await notifyWithPreferences({
    userId: assignee.id,
    actorId,
    domain: "ppt_task",
    type: "ASSIGNED_TO_YOU",
    title: issueIdentifier
      ? `PPT assigned to you: ${issueIdentifier}`
      : "PPT assigned to you",
    message: `${issueTitle} was approved and assigned to you.`,
    href: "/dashboard/ppts",
    entityType: "linear_issue",
    entityId: issueIdentifier ?? issueTitle,
    payload: { issueIdentifier, issueTitle, issueUrl },
    dedupeKey: `ppt-task:assigned:${assignee.id}:${issueIdentifier ?? issueTitle}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: assignee.user.email
      ? {
          to: assignee.user.email,
          subject: `PPT assigned to you: ${issueTitle}`,
          category: "ppt_task_assigned_to_you",
          idempotencyKey: `ppt-task:assigned:${issueIdentifier ?? issueTitle}:${assignee.id}`,
        }
      : undefined,
  });
}

export async function approvePptRequest(
  requestId: string,
  options: { assigneeTarget?: PptApprovalAssigneeTarget } = {
    assigneeTarget: { type: "requester" },
  },
) {
  const adminUserId = await requireAdmin();

  const request = await prisma.pptRequest.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        include: { user: { select: { email: true, name: true } } },
      },
      attachments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!request) return { error: "Request not found" };
  if (request.status !== "PENDING") return { error: "Request is not pending" };

  try {
    return await withLinearFallback(adminUserId, async (client) => {
      // Find or create "PPT" label
      const labels = await client.issueLabels({
        filter: { name: { eq: "PPT" } },
        first: 1,
      });
      let pptLabelId = labels.nodes[0]?.id;

      if (!pptLabelId) {
        const created = await client.createIssueLabel({
          name: "PPT",
          color: "#10b981",
        });
        const label = await created.issueLabel;
        if (!label) return { error: "Failed to create PPT label" };
        pptLabelId = label.id;
      }

      const dueDate = request.projectedDueDate.toISOString().split("T")[0];
      const linearEstimate =
        complexityLevelToLinearEstimate(request.requestedEstimate) ??
        request.requestedEstimate;
      let issueId = request.linearIssueId;
      let issueIdentifier = request.linearIssueIdentifier;
      let issueUrl = request.linearIssueUrl;
      const assigneeTarget = options.assigneeTarget ?? { type: "requester" };
      const selectedAssigneeId =
        assigneeTarget.type === "requester"
          ? request.requester.linearId
          : assigneeTarget.type === "linear_user"
            ? assigneeTarget.linearId
            : null;

      if (issueId) {
        // Existing issue — update it
        const issue = await client.issue(issueId);
        const existingLabels = await issue.labels();
        const existingLabelIds = existingLabels.nodes.map((l) => l.id);

        const updateData: Record<string, unknown> = {
          labelIds: [...new Set([...existingLabelIds, pptLabelId])],
          estimate: linearEstimate,
          dueDate,
        };

        if (assigneeTarget.type === "open") {
          updateData.assigneeId = null;
        } else if (selectedAssigneeId) {
          updateData.assigneeId = selectedAssigneeId;
        }

        await client.updateIssue(issueId, updateData);
        if (
          request.attachments.length > 0 ||
          request.note ||
          request.description
        ) {
          await client.createComment({
            issueId,
            body: approvalComment(request),
          });
        }
      } else {
        // New issue — create it
        const todoStateId = await findTodoWorkflowStateId(
          client,
          request.linearTeamId,
        );
        const result = await client.createIssue({
          title: request.linearIssueTitle,
          teamId: request.linearTeamId,
          labelIds: [pptLabelId],
          estimate: linearEstimate,
          dueDate,
          ...(todoStateId && { stateId: todoStateId }),
          ...(request.linearProjectId && {
            projectId: request.linearProjectId,
          }),
          description: approvedIssueDescription(request),
          ...(selectedAssigneeId && { assigneeId: selectedAssigneeId }),
        });
        const createdIssue = await result.issue;
        if (!createdIssue) return { error: "Failed to create Linear issue" };

        issueId = createdIssue.id;
        issueIdentifier = createdIssue.identifier;
        issueUrl = createdIssue.url;
      }

      // Update the request record
      await prisma.pptRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewerId: adminUserId,
          reviewedAt: new Date(),
          linearIssueId: issueId,
          // Keep the active discriminator pointed at the issue. For new-issue
          // requests the issue is created here, so this is where it first gets
          // set — otherwise the freshly-created issue would be re-requestable.
          activeLinearIssueId: issueId,
          linearIssueIdentifier: issueIdentifier,
          linearIssueUrl: issueUrl,
        },
      });

      // Send approval email
      try {
        const email = request.requester.user.email;
        const name =
          request.requester.legalName ||
          request.requester.user.name ||
          "Developer";
        const estimatedAmount = formatAmount(
          estimateToAmount(request.requestedEstimate, "MYR"),
          "MYR",
        );

        await notifyWithPreferences({
          userId: request.requesterId,
          actorId: adminUserId,
          domain: "ppt_request",
          type: "APPROVED",
          title: issueIdentifier
            ? `PPT request approved: ${issueIdentifier}`
            : "PPT request approved",
          message: `${request.linearIssueTitle} was approved for ${estimatedAmount}.`,
          href: "/dashboard/ppts",
          entityType: "ppt_request",
          entityId: requestId,
          dedupeKey: `ppt-request:approved:${requestId}`,
          channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
          email:
            email && issueIdentifier && issueUrl
              ? {
                  to: email,
                  subject: `PPT Request Approved: ${issueIdentifier}`,
                  category: "ppt_request_approved",
                  idempotencyKey: `ppt-request:approved:${requestId}`,
                  react: createElement(PptRequestApproved, {
                    userName: name,
                    issueIdentifier,
                    issueTitle: request.linearIssueTitle,
                    issueUrl,
                    estimate: request.requestedEstimate,
                    estimatedAmount,
                  }),
                }
              : undefined,
        });
      } catch (emailError) {
        console.error("Failed to send PPT approval email:", emailError);
      }

      revalidatePath("/dashboard/admin");
      revalidatePath("/dashboard/ppts");
      updateTag(TAGS.workspacePpts);
      if (selectedAssigneeId) {
        updateTag(TAGS.userIssues(selectedAssigneeId));
        await notifyAssignedPpt({
          assigneeLinearId: selectedAssigneeId,
          requesterId: request.requesterId,
          actorId: adminUserId,
          issueIdentifier,
          issueTitle: request.linearIssueTitle,
          issueUrl,
        });
      } else if (assigneeTarget.type === "open") {
        await notifyOpenPptAvailable({
          requesterId: request.requesterId,
          actorId: adminUserId,
          issueIdentifier,
          issueTitle: request.linearIssueTitle,
          issueUrl,
        });
      }

      return { success: true };
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      return {
        error:
          "Linear reauthentication required. Please reconnect your Linear account.",
        reauth: true,
      };
    }
    console.error("Failed to approve PPT request:", e);
    return { error: (e as Error).message || "Failed to approve request" };
  }
}

export async function rejectPptRequest(requestId: string, reason?: string) {
  const adminUserId = await requireAdmin();

  const request = await prisma.pptRequest.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  if (!request) return { error: "Request not found" };
  if (request.status !== "PENDING") return { error: "Request is not pending" };

  await prisma.pptRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewerId: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: reason?.trim() || null,
      // Free the issue so the developer can submit a new request for it.
      activeLinearIssueId: null,
    },
  });

  // Send rejection email
  try {
    const email = request.requester.user.email;
    const name =
      request.requester.legalName || request.requester.user.name || "Developer";

    await notifyWithPreferences({
      userId: request.requesterId,
      actorId: adminUserId,
      domain: "ppt_request",
      type: "REJECTED",
      title: `PPT request rejected: ${request.linearIssueTitle}`,
      message: reason?.trim() || "Your PPT request was rejected.",
      href: "/dashboard/ppts",
      entityType: "ppt_request",
      entityId: requestId,
      dedupeKey: `ppt-request:rejected:${requestId}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: email
        ? {
            to: email,
            subject: `PPT Request Rejected: ${request.linearIssueTitle}`,
            category: "ppt_request_rejected",
            idempotencyKey: `ppt-request:rejected:${requestId}`,
            react: createElement(PptRequestRejected, {
              userName: name,
              issueTitle: request.linearIssueTitle,
              reason: reason?.trim() || undefined,
            }),
          }
        : undefined,
    });
  } catch (emailError) {
    console.error("Failed to send PPT rejection email:", emailError);
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/ppts");

  return { success: true };
}
