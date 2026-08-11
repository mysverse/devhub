"use server";

/**
 * On-demand summary of one proof comment, for the admin judging it.
 *
 * Triggered by a button, never by a render. The payout board shows up to a
 * hundred pending rows; summarising on render would be a hundred model calls
 * per page load and would exhaust the hourly cap on first paint.
 *
 * The client sends a Linear issue id and nothing else. Everything the model
 * sees is re-read here — body, title, attachments — so a caller cannot put
 * words in the prompt by sending its own text.
 */

import { createAssistantRedactor } from "@/lib/assistant";
import { requireAdmin } from "@/lib/authz";
import { isLlmConfigured } from "@/lib/llm";
import type { ProofReviewResult } from "@/lib/llm-prompts";
import { reviewProofForAdmin } from "@/lib/llm-suggestions";
import {
  isAttachmentImage,
  isAttachmentVideo,
} from "@/lib/ppt-attachment-policy";
import { summarizeProofEvidence } from "@/lib/ppt-proof";
import prisma from "@/lib/prisma";

export type ProofReviewOutcome =
  | { available: false }
  | { available: true; review: ProofReviewResult | null };

export async function summarizeProofForAdmin(
  linearIssueId: string,
): Promise<ProofReviewOutcome> {
  const adminUserId = await requireAdmin();
  if (!isLlmConfigured()) return { available: false };

  const state = await prisma.pptPayoutState.findUnique({
    where: { linearIssueId },
    select: {
      userId: true,
      linearIssueIdentifier: true,
      linearIssueTitle: true,
      proofCommentBody: true,
      proofCommentId: true,
    },
  });
  if (!state?.proofCommentBody) return { available: true, review: null };

  const attachments = state.proofCommentId
    ? await prisma.pptCommentAttachment.findMany({
        where: { linearCommentId: state.proofCommentId },
        select: { mimeType: true },
      })
    : [];

  /**
   * Built for the proof AUTHOR, not the admin reading it. A redactor made for
   * the viewer would scrub the admin's own name and bank details out of a
   * comment that never contained them, and leave the developer's intact.
   */
  const redact = state.userId
    ? await createAssistantRedactor(state.userId)
    : (text: string) => text;

  const body = redact(state.proofCommentBody);
  const evidence = summarizeProofEvidence(body);

  const review = await reviewProofForAdmin(
    {
      identifier: state.linearIssueIdentifier ?? "this task",
      title: state.linearIssueTitle ?? "(untitled)",
      body,
      // Mime category only. Filenames are developer-controlled and can be
      // anything at all, including someone's ID document's name.
      attachmentKinds: attachments.map((attachment) =>
        isAttachmentImage(attachment.mimeType)
          ? ("image" as const)
          : isAttachmentVideo(attachment.mimeType)
            ? ("video" as const)
            : ("file" as const),
      ),
      evidence: {
        links: evidence.links,
        images: evidence.images,
        references: evidence.references,
      },
    },
    // Metered against the admin who asked, since they are who triggered spend.
    adminUserId,
  );

  return { available: true, review };
}
