import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createElement } from "react";
import PptRequestSubmitted from "@/emails/PptRequestSubmitted";
import { getSession } from "@/lib/auth-utils";
import { ADMIN_ACCESS_WHERE } from "@/lib/authz";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import {
  EMAIL_CHANNEL,
  IN_APP_CHANNEL,
  notifyWithPreferences,
} from "@/lib/notifications";
import {
  PPT_ATTACHMENT_MAX_FILES,
  PPT_ATTACHMENT_MAX_TOTAL_SIZE,
  uploadPptAttachmentToLinear,
} from "@/lib/ppt-request-attachments";
import prisma from "@/lib/prisma";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  return value || null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Invalid form data");
  }

  const mode = formString(formData, "mode");
  if (mode !== "new" && mode !== "existing") {
    return jsonError("Invalid PPT request mode");
  }

  const linearIssueTitle = formString(formData, "linearIssueTitle");
  const linearTeamId = formString(formData, "linearTeamId");
  const requestedEstimate = Number.parseInt(
    formString(formData, "requestedEstimate"),
    10,
  );
  const dueDate = new Date(formString(formData, "projectedDueDate"));
  const assigneeIntent = formString(formData, "assigneeIntent") || "SELF";

  if (!linearIssueTitle) return jsonError("Issue title is required");
  if (!linearTeamId) return jsonError("Team is required");
  if (
    !Number.isInteger(requestedEstimate) ||
    requestedEstimate < 1 ||
    requestedEstimate > 5
  ) {
    return jsonError("Complexity must be between 1 and 5");
  }
  if (Number.isNaN(dueDate.getTime())) {
    return jsonError("Valid due date is required");
  }
  if (!["SELF", "TEAM_MEMBER", "OPEN"].includes(assigneeIntent)) {
    return jsonError("Invalid assignment intent");
  }

  const linearIssueId = optionalFormString(formData, "linearIssueId");
  if (mode === "existing" && !linearIssueId) {
    return jsonError("Linear issue is required");
  }

  if (mode === "existing" && linearIssueId) {
    const existing = await prisma.pptRequest.findFirst({
      where: {
        linearIssueId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { id: true },
    });
    if (existing) {
      return jsonError("A PPT request already exists for this issue");
    }
  }

  const files = formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > PPT_ATTACHMENT_MAX_FILES) {
    return jsonError(`You can upload up to ${PPT_ATTACHMENT_MAX_FILES} files`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > PPT_ATTACHMENT_MAX_TOTAL_SIZE) {
    return jsonError("Attachments must be 30 MB or less in total");
  }

  try {
    const uploadedAttachments = await withLinearFallback(
      userId,
      async (client) => {
        const uploaded = [];
        for (const file of files) {
          uploaded.push(await uploadPptAttachmentToLinear(client, file));
        }
        return uploaded;
      },
    );

    const requestRecord = await prisma.pptRequest.create({
      data: {
        requesterId: userId,
        linearIssueId: mode === "existing" ? linearIssueId : null,
        linearIssueIdentifier:
          mode === "existing"
            ? optionalFormString(formData, "linearIssueIdentifier")
            : null,
        linearIssueTitle,
        linearIssueUrl:
          mode === "existing"
            ? optionalFormString(formData, "linearIssueUrl")
            : null,
        linearTeamId,
        linearProjectId: optionalFormString(formData, "linearProjectId"),
        linearProjectName: optionalFormString(formData, "linearProjectName"),
        requestedEstimate,
        projectedDueDate: dueDate,
        description: optionalFormString(formData, "description"),
        note: optionalFormString(formData, "note"),
        assigneeIntent: assigneeIntent as "SELF" | "TEAM_MEMBER" | "OPEN",
        intendedAssigneeLinearId:
          assigneeIntent === "TEAM_MEMBER"
            ? optionalFormString(formData, "intendedAssigneeLinearId")
            : null,
        intendedAssigneeName:
          assigneeIntent === "TEAM_MEMBER"
            ? optionalFormString(formData, "intendedAssigneeName")
            : null,
        intendedAssigneeEmail:
          assigneeIntent === "TEAM_MEMBER"
            ? optionalFormString(formData, "intendedAssigneeEmail")
            : null,
        attachments: {
          create: uploadedAttachments.map((attachment, index) => ({
            uploadedById: userId,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            byteSize: attachment.byteSize,
            width: attachment.width,
            height: attachment.height,
            linearAssetUrl: attachment.linearAssetUrl,
            sortOrder: index,
          })),
        },
      },
    });

    const [admins, requester] = await Promise.all([
      prisma.userProfile.findMany({
        where: ADMIN_ACCESS_WHERE,
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.userProfile.findUnique({
        where: { id: userId },
        include: { user: { select: { name: true } } },
      }),
    ]);

    const requesterName =
      requester?.legalName || requester?.user.name || "A developer";
    const estimatedAmount = formatAmount(
      estimateToAmount(requestedEstimate, "MYR"),
      "MYR",
    );

    for (const admin of admins) {
      await notifyWithPreferences({
        userId: admin.id,
        actorId: userId,
        domain: "ppt_request",
        type: "SUBMITTED",
        title: `New PPT request: ${linearIssueTitle}`,
        message: `${requesterName} requested ${estimatedAmount} for ${linearIssueTitle}.`,
        href: `/dashboard/admin?tab=ppt-requests&request=${requestRecord.id}`,
        entityType: "ppt_request",
        entityId: requestRecord.id,
        payload: {
          attachmentCount: uploadedAttachments.length,
          assigneeIntent,
        },
        dedupeKey: `ppt-request:submitted:${requestRecord.id}:${admin.id}`,
        channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
        email: admin.user.email
          ? {
              to: admin.user.email,
              subject: `New PPT Request: ${linearIssueTitle}`,
              category: "ppt_request_submitted",
              idempotencyKey: `ppt-request:submitted:${requestRecord.id}`,
              react: createElement(PptRequestSubmitted, {
                requesterName,
                issueTitle: linearIssueTitle,
                isNewIssue: mode === "new",
                issueIdentifier:
                  optionalFormString(formData, "linearIssueIdentifier") ??
                  undefined,
                estimate: requestedEstimate,
                estimatedAmount,
                dueDate: dueDate.toLocaleDateString("en-MY", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                note: optionalFormString(formData, "note") ?? undefined,
              }),
            }
          : undefined,
      });
    }

    revalidatePath("/dashboard/ppts");
    revalidatePath("/dashboard/admin");

    return NextResponse.json({ success: true, requestId: requestRecord.id });
  } catch (error) {
    if (error instanceof LinearReauthRequiredError) {
      return NextResponse.json(
        { error: "reauth_required", reauth: true },
        { status: 401 },
      );
    }
    console.error("[ppt-requests] Submit failed:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to submit PPT request",
      500,
    );
  }
}
