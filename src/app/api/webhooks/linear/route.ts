import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { syncBonusCandidateFromLinearIssue } from "@/lib/bonus";
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
      labels: Array.isArray(issueData.labels) ? issueData.labels : [],
    });

    await recordIssueCompletionFromLinear({
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
      labels: Array.isArray(issueData.labels) ? issueData.labels : [],
    });
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
