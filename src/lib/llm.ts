import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";

// DevHub's only LLM surface. Everything that reaches Claude goes through here
// so there is exactly one place that knows the model, the request shape, and
// the rules.
//
// Two invariants, both load-bearing:
//
//  1. The adapter is ALWAYS optional. getLlmClient() returns null when no API
//     key is configured — mirroring getLinearServiceClient() — and every
//     caller must have a working manual path for that case. Nothing in the
//     payout chain, and nothing a developer needs to get paid, may depend on
//     a model being reachable.
//
//  2. No PII leaves this process. Prompts are built from Linear issue text
//     and specialty enums only: never legalName, email, address, bank
//     details, or KYC data. Prompt builders take explicitly narrowed inputs
//     (see llm-prompts.ts) so this is enforced by shape, not by care.

/** One model, named once. */
export const LLM_MODEL = "claude-opus-5";

/**
 * Non-streaming ceiling. Drafts are short; this is headroom, not a target.
 * Anything that could run long should stream instead.
 */
const MAX_TOKENS = 16_000;

let cachedClient: Anthropic | null | undefined;

/**
 * Returns null when ANTHROPIC_API_KEY is unset. Callers branch on null and
 * fall back to the manual path — the feature degrades, it never errors.
 */
export function getLlmClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedClient = apiKey ? new Anthropic({ apiKey }) : null;
  return cachedClient;
}

export function isLlmConfigured() {
  return getLlmClient() !== null;
}

export type LlmRequest<Schema extends z.ZodType> = {
  /** Operator instructions. Never contains user or issue content. */
  system: string;
  /** The data being reasoned about, already narrowed and PII-free. */
  prompt: string;
  /** Shape the reply must take. Validated before it reaches a caller. */
  schema: Schema;
};

/**
 * Ask for one structured answer, or null.
 *
 * Null covers every failure — no key, rate limit, refusal, malformed output,
 * network. Callers can't tell them apart on purpose: there is one fallback
 * path (do it manually) and no partial-success state to reason about.
 */
export async function generateStructured<Schema extends z.ZodType>(
  request: LlmRequest<Schema>,
): Promise<z.infer<Schema> | null> {
  const client = getLlmClient();
  if (!client) return null;

  try {
    const message = await client.messages.parse({
      model: LLM_MODEL,
      max_tokens: MAX_TOKENS,
      // Drafting a well-scoped task from an issue is a judgement call, not an
      // extraction — let the model decide how much thinking it needs.
      thinking: { type: "adaptive" },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      output_config: { format: zodOutputFormat(request.schema) },
    });

    // A refusal returns a normal 200 with no parsed output; treat it as
    // "no suggestion available" like any other miss.
    return message.parsed_output ?? null;
  } catch (error) {
    console.warn(
      "[llm] structured generation failed, falling back to manual path:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Test seam: forget the memoised client so env changes take effect. */
export function resetLlmClientForTests() {
  cachedClient = undefined;
}
