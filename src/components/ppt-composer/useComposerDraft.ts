"use client";

import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PptComposerMode } from "@/lib/ppt-composer-config";

const DRAFT_VERSION = 1;

type StoredDraft = {
  version: number;
  savedAt: number;
  body: string;
};

/**
 * Per issue AND per mode. A developer can be mid-way through a progress note
 * on a task and then open the proof composer on the same task; sharing a key
 * would let one overwrite the other.
 */
export function composerDraftKey(mode: PptComposerMode, issueId: string) {
  return `devhub:ppt-composer:v${DRAFT_VERSION}:${mode}:${issueId}`;
}

export type ComposerDraft = {
  body: string;
  setBody: (next: string) => void;
  /** True once a stored draft has been read back in. */
  restoredAt: number | null;
  /** Forget the stored draft and return the textarea to the template. */
  resetToTemplate: () => void;
  /** Forget the stored draft, keeping whatever is on screen. Use after posting. */
  clearDraft: () => void;
};

/**
 * Autosaves the comment body to localStorage so a refresh, a misclick, or a
 * phone backgrounding the tab does not throw away a half-written proof.
 *
 * Attachments are deliberately NOT persisted: a `File` is not serializable,
 * and a stored attachment id whose comment never posted is worse than nothing
 * — it would be claimed by a later comment the developer never associated
 * with it. The bytes are cheap to re-drop; the wrong evidence on a payout is
 * not.
 */
export function useComposerDraft({
  mode,
  issueId,
  template,
}: {
  mode: PptComposerMode;
  issueId: string;
  template: string;
}): ComposerDraft {
  const [body, setBodyState] = useState(template);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  // Only a body the developer actually edited is worth persisting — otherwise
  // every mount would write the untouched template back over a real draft.
  const dirtyRef = useRef(false);

  const key = composerDraftKey(mode, issueId);

  // Restore in an effect rather than a useState initializer: reading
  // localStorage during render is a hydration mismatch, because the server
  // renders the template and the browser would render the draft.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // Private browsing / storage disabled — drafts are best-effort.
      return;
    }
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as StoredDraft;
      if (stored.version !== DRAFT_VERSION) return;
      if (typeof stored.body !== "string" || !stored.body.trim()) return;
      if (stored.body === template) return;
      dirtyRef.current = true;
      setBodyState(stored.body);
      setRestoredAt(stored.savedAt ?? Date.now());
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }, [key, template]);

  const persist = useDebouncedCallback((next: string) => {
    if (!dirtyRef.current) return;
    try {
      const stored: StoredDraft = {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        body: next,
      };
      localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // Storage full or blocked — the draft simply isn't kept.
    }
  }, 400);

  const setBody = useCallback(
    (next: string) => {
      dirtyRef.current = true;
      setBodyState(next);
      persist(next);
    },
    [persist],
  );

  const clearDraft = useCallback(() => {
    dirtyRef.current = false;
    setRestoredAt(null);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  const resetToTemplate = useCallback(() => {
    clearDraft();
    setBodyState(template);
  }, [clearDraft, template]);

  return { body, setBody, restoredAt, resetToTemplate, clearDraft };
}
