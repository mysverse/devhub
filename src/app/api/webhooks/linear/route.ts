import crypto from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { syncBonusCandidateFromLinearIssue } from "@/lib/bonus";
import { TAGS } from "@/lib/cache-tags";
import { recordIssueCompletionFromLinear } from "@/lib/incentives";
import {
  evaluatePptIssueFromWebhook,
  handlePptCommentWebhook,
} from "@/lib/ppt-eligibility";

export async function POST(req: Request) {
  const signature = req.headers.get("linear-signature");
  const body = await req.text();

  // Verify Webhook Signature (if LINEAR_WEBHOOK_SECRET is set)
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");
    if (signature !== expectedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  const payload = JSON.parse(body);

  // We only care about Issue creates/updates
  if (
    (payload.action === "create" || payload.action === "update") &&
    payload.type === "Issue"
  ) {
    const issueData = payload.data;
    const labels = Array.isArray(issueData.labels) ? issueData.labels : [];

    await evaluatePptIssueFromWebhook(issueData);

    await syncBonusCandidateFromLinearIssue({
      id: issueData.id,
      identifier: issueData.identifier || null,
      title: issueData.title || null,
      url: issueData.url || null,
      estimate: issueData.estimate ?? null,
      completedAt: issueData.completedAt ?? null,
      state: issueData.state
        ? {
            type: issueData.state.type ?? null,
            name: issueData.state.name ?? null,
          }
        : null,
      assignee: issueData.assignee
        ? {
            id: issueData.assignee.id ?? null,
            email: issueData.assignee.email ?? null,
            name: issueData.assignee.name ?? null,
            displayName: issueData.assignee.displayName ?? null,
          }
        : null,
      labels,
    });

    const issueCompletion = await recordIssueCompletionFromLinear({
      id: issueData.id,
      identifier: issueData.identifier || null,
      title: issueData.title || null,
      url: issueData.url || null,
      estimate: issueData.estimate ?? null,
      completedAt: issueData.completedAt ?? null,
      updatedAt: issueData.updatedAt ?? null,
      archivedAt: issueData.archivedAt ?? null,
      trashed: issueData.trashed ?? null,
      state: issueData.state
        ? {
            type: issueData.state.type ?? null,
            name: issueData.state.name ?? null,
          }
        : null,
      assignee: issueData.assignee
        ? {
            id: issueData.assignee.id ?? null,
            email: issueData.assignee.email ?? null,
            name: issueData.assignee.name ?? null,
            displayName: issueData.assignee.displayName ?? null,
          }
        : null,
      labels,
    });

    try {
      const hasPptLabel = labels.some(
        (label: { name?: string | null }) =>
          label.name?.trim().toUpperCase() === "PPT",
      );
      if (hasPptLabel) {
        revalidateTag(TAGS.workspacePpts, { expire: 0 });
      }
      const assigneeLinearId = issueData.assignee?.id;
      if (assigneeLinearId) {
        revalidateTag(TAGS.userIssues(assigneeLinearId), { expire: 0 });
      }
      if (issueCompletion?.userId) {
        revalidateTag(TAGS.incentiveProgress(issueCompletion.userId), {
          expire: 0,
        });
      }
    } catch (error) {
      console.error("[linear-webhook] Failed to revalidate cache tags:", error);
    }
  }

  if (
    (payload.action === "create" || payload.action === "update") &&
    payload.type === "Comment"
  ) {
    await handlePptCommentWebhook({
      ...payload.data,
      issueId: payload.data.issueId ?? payload.data.issue?.id ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
