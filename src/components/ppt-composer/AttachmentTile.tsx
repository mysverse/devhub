"use client";

import {
  ActionIcon,
  Image,
  RingProgress,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { Check, FileText, Film, RotateCw, X } from "lucide-react";
import { motion } from "motion/react";
import { SPRING } from "@/components/animations";
import { formatFileSize, isAttachmentVideo } from "@/lib/ppt-attachment-policy";
import type { UploadedAttachment } from "@/lib/ppt-attachment-upload-client";
import styles from "./PptComposer.module.css";

export type ComposerAttachmentStatus = "uploading" | "done" | "error";

export type ComposerAttachment = {
  /**
   * Stable client-side key. Never the server id — that only exists once the
   * upload lands, and the tile has to be keyed from the moment it appears.
   */
  localId: string;
  file: File;
  /**
   * `URL.createObjectURL` over the local bytes we already hold. Fetching the
   * thumbnail back through the authenticated proxy would re-download a file
   * that is sitting in memory. Revoked on removal and on unmount.
   */
  previewUrl: string | null;
  status: ComposerAttachmentStatus;
  /** 0..1, from the real XHR/Blob upload progress. */
  progress: number;
  uploaded: UploadedAttachment | null;
  error: string | null;
};

/** The name to show: the server's final one once known, the local one before. */
export function attachmentLabel(attachment: ComposerAttachment) {
  return attachment.uploaded?.filename ?? attachment.file.name;
}

export default function AttachmentTile({
  attachment,
  readOnly = false,
  onRemove,
  onRetry,
  removeRef,
}: {
  attachment: ComposerAttachment;
  /** Preview rendering — no remove or retry controls. */
  readOnly?: boolean;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  /** Registers the remove button so the tray can move focus after a removal. */
  removeRef?: (node: HTMLButtonElement | null) => void;
}) {
  const { status, previewUrl, file, progress, error } = attachment;
  const label = attachmentLabel(attachment);
  const isVideo = isAttachmentVideo(file.type);

  return (
    <div className={styles.tile} data-status={status}>
      <div className={styles.tileMedia}>
        {previewUrl && !isVideo ? (
          <Image
            src={previewUrl}
            alt={label}
            className={styles.thumb}
            loading="lazy"
          />
        ) : (
          <ThemeIcon variant="light" color="gray" size="lg" radius="md">
            {isVideo ? <Film size={18} /> : <FileText size={18} />}
          </ThemeIcon>
        )}

        {status === "uploading" && (
          <div className={styles.tileScrim}>
            <RingProgress
              size={54}
              thickness={4}
              roundCaps
              sections={[{ value: Math.round(progress * 100), color: "blue" }]}
              aria-label={`Uploading ${label}`}
            />
          </div>
        )}

        {status === "error" && (
          <div className={styles.tileScrim}>
            {readOnly ? (
              <ThemeIcon color="red" variant="filled" radius="xl" size="md">
                <X size={14} />
              </ThemeIcon>
            ) : (
              <Tooltip label="Retry upload" withArrow>
                <ActionIcon
                  color="red"
                  variant="filled"
                  radius="xl"
                  size="md"
                  aria-label={`Retry uploading ${label}`}
                  onClick={() => onRetry(attachment.localId)}
                >
                  <RotateCw size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        )}

        {status === "done" && (
          <motion.div
            className={styles.tileBadge}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING.pop}
          >
            <ThemeIcon color="green" variant="filled" radius="xl" size="sm">
              <Check size={12} />
            </ThemeIcon>
          </motion.div>
        )}

        {!readOnly && (
          <ActionIcon
            ref={removeRef}
            className={styles.removeButton}
            size="sm"
            radius="xl"
            variant="filled"
            color="dark"
            aria-label={`Remove ${label}`}
            onClick={() => onRemove(attachment.localId)}
          >
            <X size={12} />
          </ActionIcon>
        )}
      </div>

      <div className={styles.tileMeta}>
        <Text size="xs" fw={500} truncate="end" title={label}>
          {label}
        </Text>
        <Text size="xs" c={status === "error" ? "red" : "dimmed"} lineClamp={2}>
          {status === "error"
            ? (error ?? "Upload failed")
            : formatFileSize(file.size)}
        </Text>
      </div>
    </div>
  );
}
