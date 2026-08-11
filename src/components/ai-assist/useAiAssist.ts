"use client";

import { type RefObject, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  assistWriting,
  reviewBeforePosting,
} from "@/app/dashboard/ai-assist-actions";
import {
  AI_ASSIST_FIELDS,
  type AiAssistAction,
  type AiAssistFieldId,
  assistEligibility,
} from "@/lib/ai-assist-config";
import type { WritingReviewResult } from "@/lib/llm-prompts";
import { useAiAssistAvailable } from "./AiAssistAvailability";

/**
 * The state machine behind every writing-assist affordance.
 *
 * Three behaviours here are load-bearing rather than stylistic:
 *
 * - **It proposes, it never replaces.** The rewrite is held here until someone
 *   accepts it. The composer's whole design story is "never lose the caret,
 *   never lose the draft", and `useComposerDraft` debounce-persists the body to
 *   localStorage 400ms after any change — an in-place rewrite would overwrite
 *   the saved draft and put the original beyond recovery.
 * - **A selection scopes the request.** Fixing one paragraph of a long proof
 *   comment sends and replaces that paragraph only, which keeps both the cost
 *   and the blast radius proportional to what is being fixed. The selection is
 *   captured at press time because it is gone by the time the reply lands.
 * - **The same draft is never paid for twice.** Press, read, press again is the
 *   observed pattern; the second press re-shows the held proposal.
 */

export type AiAssistProposal = {
  /** The full field value if this is accepted — selection already spliced in. */
  nextValue: string;
  /** Just the rewritten span, for display. */
  rewrite: string;
  changeNote: string;
  /** True when only part of the field was sent. */
  partial: boolean;
};

type CacheKey = `${AiAssistAction}:${string}`;

export type UseAiAssistOptions = {
  fieldId: AiAssistFieldId;
  value: string;
  onChange: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /**
   * Server-computed. False renders nothing at all. Defaults to the dashboard
   * shell's value, so most hosts pass nothing.
   */
  available?: boolean;
  /** True while the host form is submitting. */
  disabled?: boolean;
  /**
   * Delegate to the host's existing aria-live region where there is one. Two
   * polite regions in the same dialog interleave unpredictably.
   */
  onAnnounce?: (message: string) => void;
};

export function useAiAssist({
  fieldId,
  value,
  onChange,
  textareaRef,
  available: availableProp,
  disabled,
  onAnnounce,
}: UseAiAssistOptions) {
  const config = AI_ASSIST_FIELDS[fieldId];
  const shellAvailable = useAiAssistAvailable();
  const available = availableProp ?? shellAvailable;

  const [running, setRunning] = useState<AiAssistAction | "review" | null>(
    null,
  );
  const [capped, setCapped] = useState(false);
  const [proposal, setProposal] = useState<AiAssistProposal | null>(null);
  const [review, setReview] = useState<WritingReviewResult | null>(null);

  const cache = useRef(new Map<CacheKey, AiAssistProposal>());
  const undoRef = useRef<string | null>(null);

  const eligibility = assistEligibility(config, value);
  const busy = running !== null;

  const announce = useCallback(
    (message: string) => onAnnounce?.(message),
    [onAnnounce],
  );

  /** Whatever is selected right now, or the whole field. */
  const readTarget = useCallback(() => {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? 0;
    const end = element?.selectionEnd ?? 0;
    // A selection has to be worth scoping to: a stray double-click should not
    // quietly turn "polish this comment" into "polish this word".
    if (element && end - start >= config.minInputChars) {
      return { text: value.slice(start, end), start, end, partial: true };
    }
    return { text: value, start: 0, end: value.length, partial: false };
  }, [config.minInputChars, textareaRef, value]);

  const run = useCallback(
    async (action: AiAssistAction) => {
      if (busy || disabled || !available) return;
      const target = readTarget();

      const key: CacheKey = `${action}:${target.text}`;
      const cached = cache.current.get(key);
      if (cached) {
        setProposal(cached);
        announce("Showing the suggestion again.");
        return;
      }

      setRunning(action);
      try {
        const outcome = await assistWriting({
          fieldId,
          action,
          text: target.text,
        });

        if (!outcome.available) {
          toast.info("Writing help isn't available right now.");
          return;
        }
        if (outcome.result === null) {
          if (outcome.reason === "rate_limited") {
            setCapped(true);
            announce("Writing help is resting for the next hour.");
            return;
          }
          toast.info("No suggestion this time — send it as you wrote it.");
          return;
        }

        const next: AiAssistProposal = {
          nextValue: target.partial
            ? value.slice(0, target.start) +
              outcome.result.rewrite +
              value.slice(target.end)
            : outcome.result.rewrite,
          rewrite: outcome.result.rewrite,
          changeNote: outcome.result.changeNote,
          partial: target.partial,
        };
        cache.current.set(key, next);
        setProposal(next);
        announce("A suggested rewrite is ready to review below.");
      } catch {
        // A transport failure is not the author's problem, and their draft is
        // untouched either way.
        toast.info("Writing help didn't respond — carry on as you were.");
      } finally {
        setRunning(null);
      }
    },
    [announce, available, busy, disabled, fieldId, readTarget, value],
  );

  const runReview = useCallback(async () => {
    if (busy || disabled || !available || !config.review) return;
    setRunning("review");
    try {
      const outcome = await reviewBeforePosting({ fieldId, text: value });
      if (!outcome.available) {
        toast.info("The check isn't available right now.");
        return;
      }
      if (outcome.result === null) {
        if (outcome.reason === "rate_limited") {
          setCapped(true);
          announce("Writing help is resting for the next hour.");
          return;
        }
        toast.info("Couldn't check it this time — post it as you wrote it.");
        return;
      }
      setReview(outcome.result);
      announce(
        outcome.result.concerns.length
          ? `${outcome.result.concerns.length} thing${outcome.result.concerns.length === 1 ? "" : "s"} a reviewer may ask about.`
          : "Nothing stood out.",
      );
    } catch {
      toast.info("Couldn't check it this time — post it as you wrote it.");
    } finally {
      setRunning(null);
    }
  }, [announce, available, busy, config.review, disabled, fieldId, value]);

  const accept = useCallback(() => {
    if (!proposal) return;
    undoRef.current = value;
    onChange(proposal.nextValue);
    setProposal(null);
    // The review was about the old text; leaving it up would have it describing
    // a draft that no longer exists.
    setReview(null);
    announce("Replaced. Read it before you post.");

    toast.success("Replaced — read it before you post.", {
      action: {
        label: "Undo",
        onClick: () => {
          const previous = undoRef.current;
          if (previous === null) return;
          undoRef.current = null;
          onChange(previous);
          announce("Your original wording is back.");
        },
      },
    });

    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      const caret = proposal.nextValue.length;
      element.setSelectionRange(caret, caret);
    });
  }, [announce, onChange, proposal, textareaRef, value]);

  const discard = useCallback(() => {
    setProposal(null);
    announce("Suggestion discarded. Your draft is unchanged.");
    textareaRef.current?.focus();
  }, [announce, textareaRef]);

  return {
    config,
    /** Never render anything when the adapter is unconfigured. */
    visible: available,
    actions: config.actions,
    offersReview: Boolean(config.review),
    running,
    busy,
    capped,
    eligibility,
    proposal,
    review,
    run,
    runReview,
    accept,
    discard,
    dismissReview: () => setReview(null),
  };
}
