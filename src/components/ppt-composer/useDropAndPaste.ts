"use client";

import {
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useRef,
  useState,
} from "react";

/** Where a batch of files came from — paste needs the generic-name rename. */
export type FileSource = "drop" | "paste";

export type DropAndPaste = {
  /** True while a file drag is over the panel. Drives the drop overlay. */
  isDragging: boolean;
  /** Spread onto the element that should accept drops. */
  panelProps: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
  /** Bind to the textarea AND the panel — see the note on the handler. */
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
};

/** Only arm the drop zone for actual files; dragging selected text must not. */
function carriesFiles(transfer: DataTransfer | null) {
  if (!transfer) return false;
  return Array.from(transfer.types).includes("Files");
}

/**
 * Paste-to-attach and drag-to-attach for the composer's write panel.
 *
 * Pasting a screenshot is the headline affordance: on every platform the
 * shortcut for "capture a region" puts an image on the clipboard, so the
 * shortest path from "I did the thing" to "here is the proof" is Ctrl/Cmd+V.
 */
export function useDropAndPaste({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[], source: FileSource) => void;
  disabled?: boolean;
}): DropAndPaste {
  const [isDragging, setIsDragging] = useState(false);
  /**
   * Counter, not a boolean. `dragleave` fires every time the pointer crosses
   * into a *child* element, so a boolean makes the overlay strobe as the
   * cursor moves over the textarea, the tiles and the buttons inside the zone.
   */
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || !carriesFiles(event.dataTransfer)) return;
      // Without this the browser refuses the drop and navigates to the file.
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!carriesFiles(event.dataTransfer)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current = 0;
      setIsDragging(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onFiles(files, "drop");
    },
    [disabled, onFiles],
  );

  /**
   * Bound to both the textarea and the panel around it, so a paste still
   * attaches when focus is on a tile's remove button or the tab list. React
   * events bubble, so a paste inside the textarea would otherwise be handled
   * twice — stopping propagation once we have taken the files is what keeps a
   * single screenshot from being uploaded twice.
   *
   * preventDefault only when files were taken: a plain text paste must still
   * land in the textarea.
   */
  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      if (disabled) return;
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      onFiles(files, "paste");
    },
    [disabled, onFiles],
  );

  return {
    isDragging,
    panelProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    onPaste,
  };
}
