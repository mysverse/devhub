"use client";

import {
  Button,
  Group,
  Image,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Film,
  Sparkles,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAiAssistAvailable } from "@/components/ai-assist/AiAssistAvailability";
import { AnimatedCollapse } from "@/components/animations";
import ImageLightbox, { type LightboxImage } from "@/components/ImageLightbox";
import LinearMarkdown from "@/components/LinearMarkdown";
import type { ProofReviewResult } from "@/lib/llm-prompts";
import {
  formatFileSize,
  isAttachmentImage,
  isAttachmentVideo,
} from "@/lib/ppt-attachment-policy";
import { summarizeProofEvidence } from "@/lib/ppt-proof";
import { summarizeProofForAdmin } from "./proof-review-actions";
import type { ProofAttachmentSummary } from "./types";

/**
 * The evaluator stores `proofCommentBody` as `proof.body.slice(0, 1000)`. A
 * body that lands on exactly this length was almost certainly cut, and the cut
 * can fall mid-`![alt](url)` — which react-markdown renders as literal junk.
 * Saying "truncated" is more honest than rendering the wreckage.
 */
const PROOF_BODY_CAP = 1000;

/** Lines of proof shown before the "Show full proof" toggle takes over. */
const PREVIEW_LINES = 6;

function attachmentUrl(id: string) {
  // Never linearAssetUrl: Linear's asset host requires a bearer token, and this
  // route re-authorises the viewer before streaming the bytes.
  return `/api/ppt-attachments/${id}`;
}

/**
 * Splits a proof body into a always-visible head and a collapsible tail.
 *
 * Markdown cannot be cut at an arbitrary line: a split inside a fenced code
 * block or a table renders both halves as garbage. Only a blank line outside a
 * fence is a real block boundary, so we cut at the first one past the preview
 * budget and leave the body whole when there is none.
 */
function splitProofBody(body: string, previewLines: number) {
  const lines = body.split("\n");
  // Two lines of slack: hiding a two-line tail behind a toggle costs a click
  // and saves nothing.
  if (lines.length <= previewLines + 2) return { head: body, tail: "" };

  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && index >= previewLines && line.trim() === "") {
      return {
        head: lines.slice(0, index).join("\n"),
        tail: lines.slice(index + 1).join("\n"),
      };
    }
  }
  return { head: body, tail: "" };
}

/**
 * "2 attachments · 1 link · MYS-201 · 412 characters", or nothing when there is
 * nothing to count. Plural handling is written out rather than computed so the
 * strings stay greppable.
 */
function describeEvidenceInventory(
  body: string | null,
  attachmentCount: number,
) {
  if (!body && attachmentCount === 0) return "";
  const inventory = summarizeProofEvidence(body ?? "");
  const parts: string[] = [];

  if (attachmentCount === 1) parts.push("1 attachment");
  else if (attachmentCount > 1) parts.push(`${attachmentCount} attachments`);

  if (inventory.images === 1) parts.push("1 embedded image");
  else if (inventory.images > 1)
    parts.push(`${inventory.images} embedded images`);

  if (inventory.links === 1) parts.push("1 link");
  else if (inventory.links > 1) parts.push(`${inventory.links} links`);

  // Named rather than counted: an admin wants to see MYS-201, not "1 reference".
  if (inventory.references.length > 0) {
    parts.push(inventory.references.slice(0, 3).join(", "));
  }

  if (inventory.contentChars > 0) {
    parts.push(`${inventory.contentChars} characters`);
  }

  return parts.join(" · ");
}

/**
 * The model's read of the proof, labelled as what it is.
 *
 * "Summary — not a verdict" is load-bearing copy, not hedging. DevHub decides
 * whether proof qualifies with checkProofBody(), and an admin who reads this
 * block as a recommendation is the failure mode the schema was shaped to make
 * impossible: it carries no verdict field at all.
 */
function ProofSummary({ review }: { review: ProofReviewResult }) {
  return (
    <Stack
      gap={6}
      style={{
        borderLeft: "3px solid var(--mantine-color-blue-6)",
        paddingLeft: "var(--mantine-spacing-sm)",
      }}
    >
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts={1}>
        Summary — not a verdict
      </Text>
      <Text size="sm">{review.summary}</Text>

      {review.verificationSteps.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed">
            To check it
          </Text>
          {review.verificationSteps.map((step) => (
            <Text key={step} size="xs" c="dimmed">
              · {step}
            </Text>
          ))}
        </>
      )}

      {review.openQuestions.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed">
            Left unanswered
          </Text>
          {review.openQuestions.map((question) => (
            <Text key={question} size="xs" c="dimmed">
              · {question}
            </Text>
          ))}
        </>
      )}
    </Stack>
  );
}

function AttachmentChip({
  attachment,
  compact,
  onImageClick,
}: {
  attachment: ProofAttachmentSummary;
  compact: boolean;
  onImageClick: (image: LightboxImage) => void;
}) {
  const href = attachmentUrl(attachment.id);

  if (isAttachmentImage(attachment.mimeType)) {
    return (
      <UnstyledButton
        onClick={() =>
          // `href` is the same route: it is the original upload, and the
          // lightbox caps at 75vh, so "open original" is a real full-size view.
          onImageClick({ src: href, alt: attachment.filename, href })
        }
        aria-label={`View ${attachment.filename} full size`}
        style={{
          borderRadius: "var(--mantine-radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--mantine-color-default-border)",
          lineHeight: 0,
        }}
      >
        <Image
          src={href}
          alt={attachment.filename}
          loading="lazy"
          h={compact ? 56 : 72}
          w={compact ? 72 : 96}
          fit="cover"
        />
      </UnstyledButton>
    );
  }

  return (
    <Button
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      size="compact-xs"
      variant="default"
      leftSection={
        isAttachmentVideo(attachment.mimeType) ? (
          <Film size={12} />
        ) : (
          <FileText size={12} />
        )
      }
    >
      {/* component="span": Button wraps its children in a <span> label, and
          Text's default <p> is invalid inside phrasing content. */}
      <Text component="span" size="xs" truncate maw={compact ? 120 : 180}>
        {attachment.filename}
      </Text>
      <Text component="span" size="xs" c="dimmed" ml={6}>
        {formatFileSize(attachment.byteSize)}
      </Text>
    </Button>
  );
}

/**
 * Renders an assignee's #ppt-proof comment inline for an admin.
 *
 * Before this, the board only linked out to Linear, so judging proof meant a
 * tab switch per payout. The comment body and its attachments are the entire
 * basis for approving money, so they belong on the card.
 *
 * `compact` is for the payout card, which is already dense — it shortens the
 * preview and shrinks the thumbnails rather than dropping information.
 */
export default function ProofReviewPanel({
  body,
  attachments,
  commentUrl,
  linearIssueId,
  variant = "inline",
}: {
  body: string | null;
  attachments: ProofAttachmentSummary[];
  commentUrl: string | null;
  /** Enables the on-demand summary. Omitted where the row has no id to send. */
  linearIssueId?: string | null;
  variant?: "inline" | "compact";
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(
    null,
  );
  const [review, setReview] = useState<ProofReviewResult | null>(null);
  const [summarizing, startSummarize] = useTransition();
  const assistAvailable = useAiAssistAvailable();

  // Nothing captured and nothing to link to — render no chrome at all rather
  // than an empty labelled box that reads as a loading failure.
  if (!body && attachments.length === 0 && !commentUrl) return null;

  const compact = variant === "compact";
  const previewLines = compact ? 4 : PREVIEW_LINES;
  const { head, tail } = body
    ? splitProofBody(body, previewLines)
    : { head: "", tail: "" };
  const truncated = (body?.length ?? 0) >= PROOF_BODY_CAP;
  const evidenceSummary = describeEvidenceInventory(body, attachments.length);
  const canSummarize =
    Boolean(linearIssueId) && assistAvailable && Boolean(body);

  return (
    <>
      <div
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          borderRadius: "var(--mantine-radius-sm)",
          padding: "var(--mantine-spacing-sm)",
          background: "var(--mantine-color-dark-7)",
        }}
      >
        <Stack gap={8}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1}>
              Proof
            </Text>
            {commentUrl && (
              <Button
                component="a"
                href={commentUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<ExternalLink size={12} />}
              >
                Open in Linear
              </Button>
            )}
          </Group>

          {body ? (
            // The markdown emits block elements (<p>, <ul>, <pre>), so it must
            // not sit inside Mantine's <Text>, which renders a <p>.
            <div
              style={{
                fontSize: compact
                  ? "var(--mantine-font-size-xs)"
                  : "var(--mantine-font-size-sm)",
                overflowWrap: "anywhere",
              }}
            >
              <LinearMarkdown onImageClick={setLightboxImage}>
                {head}
              </LinearMarkdown>
              {tail && (
                <AnimatedCollapse opened={expanded}>
                  <LinearMarkdown onImageClick={setLightboxImage}>
                    {tail}
                  </LinearMarkdown>
                </AnimatedCollapse>
              )}
            </div>
          ) : (
            <Text size="xs" c="dimmed" fs="italic">
              Proof text wasn't captured for this task.
            </Text>
          )}

          {tail && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              px={0}
              onClick={() => setExpanded((open) => !open)}
              leftSection={
                expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />
              }
            >
              {expanded ? "Show less" : "Show full proof"}
            </Button>
          )}

          {truncated && (
            <Text size="xs" c="dimmed" fs="italic">
              Truncated — open in Linear for the full comment.
            </Text>
          )}

          {/* What the evidence rule matched, counted rather than judged. The
              question an admin actually has on a board of a hundred rows is
              "is there anything here to open", and reading the prose to find
              out is the tax this removes. Never a verdict: checkProofBody() is
              the only thing that says whether proof qualifies. */}
          {evidenceSummary && (
            <Text size="xs" c="dimmed">
              {evidenceSummary}
            </Text>
          )}

          {canSummarize && (
            <Group gap="xs" wrap="nowrap">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<Sparkles size={12} />}
                loading={summarizing}
                onClick={() =>
                  startSummarize(async () => {
                    const outcome = await summarizeProofForAdmin(
                      linearIssueId as string,
                    );
                    if (!outcome.available || !outcome.review) {
                      toast.info(
                        "No summary this time — read the proof above.",
                      );
                      return;
                    }
                    setReview(outcome.review);
                  })
                }
              >
                Summarise proof
              </Button>
            </Group>
          )}

          {review && <ProofSummary review={review} />}

          {attachments.length > 0 && (
            <Group gap="xs" wrap="wrap">
              {attachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  compact={compact}
                  onImageClick={setLightboxImage}
                />
              ))}
            </Group>
          )}
        </Stack>
      </div>

      <ImageLightbox
        image={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </>
  );
}
