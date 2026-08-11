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
} from "lucide-react";
import { useState } from "react";
import { AnimatedCollapse } from "@/components/animations";
import ImageLightbox, { type LightboxImage } from "@/components/ImageLightbox";
import LinearMarkdown from "@/components/LinearMarkdown";
import {
  formatFileSize,
  isAttachmentImage,
  isAttachmentVideo,
} from "@/lib/ppt-attachment-policy";
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
  variant = "inline",
}: {
  body: string | null;
  attachments: ProofAttachmentSummary[];
  commentUrl: string | null;
  variant?: "inline" | "compact";
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(
    null,
  );

  // Nothing captured and nothing to link to — render no chrome at all rather
  // than an empty labelled box that reads as a loading failure.
  if (!body && attachments.length === 0 && !commentUrl) return null;

  const compact = variant === "compact";
  const previewLines = compact ? 4 : PREVIEW_LINES;
  const { head, tail } = body
    ? splitProofBody(body, previewLines)
    : { head: "", tail: "" };
  const truncated = (body?.length ?? 0) >= PROOF_BODY_CAP;

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
