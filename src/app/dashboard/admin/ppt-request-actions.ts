"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createElement } from "react";
import PptRequestApproved from "@/emails/PptRequestApproved";
import PptRequestRejected from "@/emails/PptRequestRejected";
import { requireAdmin } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";

export async function approvePptRequest(
  requestId: string,
  options: { assignRequester?: boolean } = { assignRequester: true },
) {
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
      let issueId = request.linearIssueId;
      let issueIdentifier = request.linearIssueIdentifier;
      let issueUrl = request.linearIssueUrl;

      if (issueId) {
        // Existing issue — update it
        const issue = await client.issue(issueId);
        const existingLabels = await issue.labels();
        const existingLabelIds = existingLabels.nodes.map((l) => l.id);

        const updateData: Record<string, unknown> = {
          labelIds: [...new Set([...existingLabelIds, pptLabelId])],
          estimate: request.requestedEstimate,
          dueDate,
        };

        if (options.assignRequester && request.requester.linearId) {
          updateData.assigneeId = request.requester.linearId;
        }

        await client.updateIssue(issueId, updateData);
      } else {
        // New issue — create it
        const result = await client.createIssue({
          title: request.linearIssueTitle,
          teamId: request.linearTeamId,
          labelIds: [pptLabelId],
          estimate: request.requestedEstimate,
          dueDate,
          ...(request.description && { description: request.description }),
          ...(options.assignRequester &&
            request.requester.linearId && {
              assigneeId: request.requester.linearId,
            }),
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

        await notify({
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
      if (options.assignRequester && request.requester.linearId) {
        updateTag(TAGS.userIssues(request.requester.linearId));
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
    },
  });

  // Send rejection email
  try {
    const email = request.requester.user.email;
    const name =
      request.requester.legalName || request.requester.user.name || "Developer";

    await notify({
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
