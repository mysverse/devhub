"use client";

import { AnimatePresence } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { AnimatedListItem } from "@/components/animations";
import AttachmentTile, { type ComposerAttachment } from "./AttachmentTile";
import styles from "./PptComposer.module.css";

export type { ComposerAttachment };

/**
 * The thumbnail grid under the textarea.
 *
 * Owns exactly one piece of behaviour beyond layout: where focus goes when a
 * tile is removed. Deleting the element that holds focus drops the user back
 * to the document body, which on a keyboard means starting the tab order over
 * from the top of the modal.
 */
export default function AttachmentTray({
  attachments,
  onRemove,
  onRetry,
  readOnly = false,
  fallbackFocusRef,
}: {
  attachments: ComposerAttachment[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  /** Preview rendering — no remove or retry controls. */
  readOnly?: boolean;
  /** Focused when the last tile is removed and there is no next tile. */
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  /**
   * State rather than a ref so the effect below has something to depend on.
   * `{ id: null }` means "that was the last tile — use the fallback".
   */
  const [pendingFocus, setPendingFocus] = useState<{
    id: string | null;
  } | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    setPendingFocus(null);
    // Set in the same event as the parent's removal, so by the time this runs
    // the tile that held focus is already out of the DOM.
    if (pendingFocus.id) {
      removeButtons.current.get(pendingFocus.id)?.focus();
      return;
    }
    fallbackFocusRef?.current?.focus();
  }, [pendingFocus, fallbackFocusRef]);

  if (attachments.length === 0) return null;

  function handleRemove(localId: string) {
    const index = attachments.findIndex((item) => item.localId === localId);
    // Prefer the tile that slides into this slot; fall back to the one before
    // it when the last tile goes, and to the picker when none are left.
    const next = attachments[index + 1] ?? attachments[index - 1] ?? null;
    setPendingFocus({ id: next?.localId ?? null });
    removeButtons.current.delete(localId);
    onRemove(localId);
  }

  return (
    <div className={styles.tileGrid}>
      <AnimatePresence mode="popLayout" initial={false}>
        {attachments.map((attachment) => (
          <AnimatedListItem key={attachment.localId}>
            <AttachmentTile
              attachment={attachment}
              readOnly={readOnly}
              onRemove={handleRemove}
              onRetry={onRetry}
              removeRef={(node) => {
                if (node) removeButtons.current.set(attachment.localId, node);
                else removeButtons.current.delete(attachment.localId);
              }}
            />
          </AnimatedListItem>
        ))}
      </AnimatePresence>
    </div>
  );
}
