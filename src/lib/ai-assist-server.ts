/**
 * The IO half of writing assist. Deliberately not a `"use server"` module —
 * nothing here is a public endpoint, and it has no business being callable from
 * a browser. The endpoints are the two exports of
 * `src/app/dashboard/ai-assist-actions.ts`, which guard the session first.
 *
 * Everything crosses two boundaries on the way out and one on the way back:
 *
 *   in   → redact → fence → generateStructured
 *   back → clamp to the field's ceiling → redact again
 *
 * The second redaction is not paranoia about the model. It is that a rewrite
 * echoes its input, and the cheapest way to guarantee the accepted text is no
 * leakier than the sent text is to run the same pass over both.
 */

import {
  AI_ASSIST_ACTIONS,
  type AiAssistAction,
  type AiAssistFieldConfig,
  assistEligibility,
  clampAssistOutput,
} from "@/lib/ai-assist-config";
import { createAssistantRedactor } from "@/lib/assistant";
import {
  checkLlmRateLimits,
  generateStructured,
  isLlmConfigured,
} from "@/lib/llm";
import {
  buildWritingAssistPrompt,
  buildWritingReviewPrompt,
  WRITING_ASSIST_SCHEMA,
  WRITING_ASSIST_SYSTEM,
  WRITING_REVIEW_SCHEMA,
  WRITING_REVIEW_SYSTEM,
  type WritingReviewResult,
} from "@/lib/llm-prompts";

/**
 * Why nothing came back. Every one of these renders as "carry on writing" — the
 * distinction exists so the copy can be honest about whether waiting helps, not
 * so any of them can read as an error.
 */
export type AiAssistFailure = "unavailable" | "rate_limited" | "too_short";

export type AiAssistRewrite = { rewrite: string; changeNote: string };

export type AiAssistOutcome<Value> =
  | { available: false }
  | { available: true; result: null; reason: AiAssistFailure }
  | { available: true; result: Value };

/**
 * The writing budget is checked here as well as inside generateStructured
 * because the two answer different questions. The adapter's check decides
 * whether to spend; this one decides what to tell the person, and "rested for
 * the next hour" is a different sentence from "no suggestion this time".
 */
async function writingBudgetAvailable(userId: string) {
  const limit = await checkLlmRateLimits(userId, { budget: "writing" });
  return !limit.limited;
}

export async function runWritingAssist(input: {
  config: AiAssistFieldConfig;
  action: AiAssistAction;
  text: string;
  userId: string;
}): Promise<AiAssistOutcome<AiAssistRewrite>> {
  const { config, action, text, userId } = input;
  if (!isLlmConfigured()) return { available: false };

  const eligibility = assistEligibility(config, text);
  if (!eligibility.ok) {
    // too_long is the client failing to enforce its own maxLength; there is
    // nothing useful to say about it, so it reads the same as too short.
    return { available: true, result: null, reason: "too_short" };
  }

  if (!(await writingBudgetAvailable(userId))) {
    return { available: true, result: null, reason: "rate_limited" };
  }

  const redact = await createAssistantRedactor(userId);
  const result = await generateStructured({
    surface: config.surface,
    userId,
    budget: "writing",
    system: WRITING_ASSIST_SYSTEM,
    prompt: buildWritingAssistPrompt({
      fieldLabel: config.label,
      houseStyle: config.houseStyle,
      action: AI_ASSIST_ACTIONS[action].instruction,
      text: redact(text.trim()),
      maxChars: config.maxChars,
      allowMarkdown: config.allowMarkdown,
      context: null,
    }),
    schema: WRITING_ASSIST_SCHEMA,
    maxTokens: config.maxTokens,
  });

  const rewrite = clampAssistOutput(config, redact(result?.rewrite ?? ""));
  if (!rewrite) return { available: true, result: null, reason: "unavailable" };

  return {
    available: true,
    result: {
      rewrite,
      changeNote: redact(result?.changeNote?.trim() ?? "").slice(0, 120),
    },
  };
}

export async function runWritingReview(input: {
  config: AiAssistFieldConfig;
  text: string;
  userId: string;
}): Promise<AiAssistOutcome<WritingReviewResult>> {
  const { config, text, userId } = input;
  const review = config.review;
  if (!isLlmConfigured() || !review) return { available: false };

  const eligibility = assistEligibility(config, text);
  if (!eligibility.ok) {
    return { available: true, result: null, reason: "too_short" };
  }

  if (!(await writingBudgetAvailable(userId))) {
    return { available: true, result: null, reason: "rate_limited" };
  }

  const redact = await createAssistantRedactor(userId);
  const result = await generateStructured({
    surface: review.surface,
    userId,
    budget: "writing",
    system: WRITING_REVIEW_SYSTEM,
    prompt: buildWritingReviewPrompt({
      fieldLabel: config.label,
      houseStyle: config.houseStyle,
      text: redact(text.trim()),
      maxChars: config.maxChars,
      allowMarkdown: config.allowMarkdown,
      context: null,
    }),
    schema: WRITING_REVIEW_SCHEMA,
    maxTokens: review.maxTokens,
  });

  if (!result) return { available: true, result: null, reason: "unavailable" };

  return {
    available: true,
    result: {
      readiness: result.readiness,
      concerns: result.concerns.slice(0, 3).map((concern) => ({
        what: redact(concern.what).slice(0, 200),
        fix: redact(concern.fix).slice(0, 200),
      })),
    },
  };
}
