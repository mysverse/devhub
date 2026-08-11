/**
 * Renders uploaded attachments as the markdown that goes into a Linear issue
 * description or comment.
 *
 * Shared by the PPT request approval path (which has embedded attachments this
 * way since it was written) and the progress/proof composers, so a screenshot
 * looks the same wherever it was posted from.
 */

import {
  formatFileSize,
  isAttachmentImage,
  isAttachmentVideo,
} from "@/lib/ppt-attachment-policy";

export type MarkdownAttachment = {
  filename: string;
  mimeType: string;
  linearAssetUrl: string;
  byteSize?: number | null;
};

export type AttachmentMarkdownOptions = {
  /** Section heading, or null to emit only the lines. Defaults to "## Attachments". */
  heading?: string | null;
};

function line(attachment: MarkdownAttachment) {
  const { filename, mimeType, linearAssetUrl, byteSize } = attachment;

  if (isAttachmentImage(mimeType)) {
    return `![${filename}](${linearAssetUrl})`;
  }

  // Markdown has no video primitive, and `![clip.mp4](…)` renders as a broken
  // image in Linear. A link degrades to a link; a broken image degrades to a
  // bug report. The size tells a reviewer whether to click on mobile data.
  if (isAttachmentVideo(mimeType)) {
    const size = byteSize
      ? ` (video, ${formatFileSize(byteSize)})`
      : " (video)";
    return `- [🎬 ${filename}](${linearAssetUrl})${size}`;
  }

  return `- [${filename}](${linearAssetUrl})`;
}

export function attachmentMarkdown(
  attachments: MarkdownAttachment[],
  options: AttachmentMarkdownOptions = {},
) {
  if (attachments.length === 0) return "";

  const heading =
    options.heading === undefined ? "## Attachments" : options.heading;
  const lines = heading ? [heading, ""] : [];

  for (const attachment of attachments) lines.push(line(attachment));

  return lines.join("\n");
}
