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

/**
 * Models DevHub is allowed to call, and how each one must be asked.
 *
 * The request shape is NOT uniform across tiers, so this can't just be a
 * string. Sonnet 5 takes adaptive thinking and an effort level; Haiku 4.5
 * predates both and takes a fixed thinking budget instead, rejecting `effort`
 * outright. Getting this wrong is a 400, not a degraded answer.
 */
const MODELS = {
  "claude-sonnet-5": { thinking: "adaptive", effort: true },
  "claude-haiku-4-5": { thinking: "budget", effort: false },
  "claude-opus-5": { thinking: "adaptive", effort: true },
} as const satisfies Record<
  string,
  { thinking: "adaptive" | "budget"; effort: boolean }
>;

export type LlmModel = keyof typeof MODELS;

/**
 * Sonnet by default: near-Opus quality on this kind of scoping work at a
 * fraction of the cost, and everything here is advisory anyway. Override with
 * ANTHROPIC_MODEL — `claude-haiku-4-5` is cheaper again if drafts are good
 * enough at that tier.
 */
const DEFAULT_MODEL: LlmModel = "claude-sonnet-5";

export function resolveLlmModel(): LlmModel {
  const configured = process.env.ANTHROPIC_MODEL;
  if (!configured) return DEFAULT_MODEL;
  if (configured in MODELS) return configured as LlmModel;
  console.warn(
    `[llm] ANTHROPIC_MODEL="${configured}" is not one of ${Object.keys(MODELS).join(", ")} — using ${DEFAULT_MODEL}.`,
  );
  return DEFAULT_MODEL;
}

/**
 * Non-streaming ceiling. Drafts are short; this is headroom, not a target.
 * Anything that could run long should stream instead.
 */
const MAX_TOKENS = 16_000;

/** Thinking budget for models without adaptive thinking. Must be < MAX_TOKENS. */
const THINKING_BUDGET_TOKENS = 4_000;

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
  /**
   * How hard to think, on models that support it. Everything here is
   * advisory output a human reviews, so the default is deliberately cheap —
   * raise it per call for work where a bad draft wastes someone's time.
   */
  effort?: "low" | "medium" | "high";
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

  const model = resolveLlmModel();
  const capabilities = MODELS[model];

  try {
    const message = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      // Drafting a well-scoped task is a judgement call, not an extraction —
      // so thinking stays on, but shaped to what the chosen model accepts.
      thinking:
        capabilities.thinking === "adaptive"
          ? { type: "adaptive" }
          : { type: "enabled", budget_tokens: THINKING_BUDGET_TOKENS },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      // effort and format share one object — keep them together, or the
      // second output_config silently drops the first.
      output_config: {
        format: zodOutputFormat(request.schema),
        ...(capabilities.effort ? { effort: request.effort ?? "low" } : {}),
      },
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
