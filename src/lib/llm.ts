import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";
import prisma from "@/lib/prisma";

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
 * Non-streaming ceiling, and the value every caller is charged up to when a
 * response is truncated. Callers pass what they actually need — a one-sentence
 * reason has no business reserving a draft's worth of output.
 */
const DEFAULT_MAX_TOKENS = 2_000;

/**
 * Hard cap. Above roughly this, non-streaming requests risk SDK HTTP timeouts
 * and should stream instead.
 */
const MAX_TOKENS_CEILING = 16_000;

/** Thinking budget for models without adaptive thinking. Must be < max_tokens. */
const THINKING_BUDGET_TOKENS = 1_024;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS_PER_HOUR = 60;
const DEFAULT_MAX_CALLS_PER_USER_PER_HOUR = 12;

/** Mirrors getHourlyLimit in email.ts: 0 or invalid disables that scope. */
function getHourlyLimit(name: string, fallback: number) {
  const configured = Number(process.env[name] ?? String(fallback));
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.floor(configured);
}

export type LlmRateLimitScope = "global" | "user";

/**
 * Rolling-window cap over the LlmCall ledger — the same shape email throttling
 * already uses (`checkEmailRateLimits`), so there is no new infrastructure and
 * no dependency on a KV store the repo doesn't have.
 */
async function checkLlmRateLimits(
  userId: string | null,
): Promise<{ limited: false } | { limited: true; scope: LlmRateLimitScope }> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const globalLimit = getHourlyLimit(
    "LLM_MAX_CALLS_PER_HOUR",
    DEFAULT_MAX_CALLS_PER_HOUR,
  );
  const userLimit = getHourlyLimit(
    "LLM_MAX_CALLS_PER_USER_PER_HOUR",
    DEFAULT_MAX_CALLS_PER_USER_PER_HOUR,
  );

  const [globalCount, userCount] = await Promise.all([
    globalLimit > 0
      ? prisma.llmCall.count({ where: { createdAt: { gte: since } } })
      : Promise.resolve(0),
    userLimit > 0 && userId
      ? prisma.llmCall.count({ where: { userId, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);

  if (globalLimit > 0 && globalCount >= globalLimit) {
    return { limited: true, scope: "global" };
  }
  if (userLimit > 0 && userId && userCount >= userLimit) {
    return { limited: true, scope: "user" };
  }
  return { limited: false };
}

/** Never throws: metering must not be able to fail the thing it measures. */
async function recordLlmCall(row: {
  surface: string;
  userId: string | null;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  ok: boolean;
}) {
  try {
    await prisma.llmCall.create({
      data: {
        surface: row.surface,
        userId: row.userId,
        model: row.model,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        ok: row.ok,
      },
    });
  } catch (error) {
    console.warn(
      "[llm] could not record usage:",
      error instanceof Error ? error.message : error,
    );
  }
}

let cachedClient: Anthropic | null | undefined;

/**
 * Returns null when ANTHROPIC_API_KEY is unset. Callers branch on null and
 * fall back to the manual path — the feature degrades, it never errors.
 */
export function getLlmClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedClient = apiKey
    ? new Anthropic({
        apiKey,
        // The SDK retries twice by default, so one failed call could be billed
        // three times. Every surface here already has a working manual
        // fallback, so a retry buys far less than it costs. The timeout keeps
        // a wedged call from holding a server action open past any function
        // limit — the SDK's default is minutes.
        maxRetries: 1,
        timeout: 60_000,
      })
    : null;
  return cachedClient;
}

export function isLlmConfigured() {
  return getLlmClient() !== null;
}

export type LlmRequest<Schema extends z.ZodType> = {
  /**
   * Which feature is asking. Recorded on every call and used to scope spend
   * when reading the ledger back.
   */
  surface: string;
  /** Whose action triggered this, for the per-user cap. Null for admin-wide work. */
  userId?: string | null;
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
  /**
   * Output budget. Pass what the shape actually needs — this is what a
   * truncated response bills up to, so a one-sentence reply asking for 16k is
   * a real cost, not just wasted headroom.
   */
  maxTokens?: number;
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

  const userId = request.userId ?? null;
  const limit = await checkLlmRateLimits(userId);
  if (limit.limited) {
    // Same contract as every other failure: null, and the caller's manual
    // path takes over. A cap must never surface as a broken feature.
    console.warn(
      `[llm] ${request.surface} skipped — hourly ${limit.scope} cap reached`,
    );
    return null;
  }

  const model = resolveLlmModel();
  const capabilities = MODELS[model];
  const maxTokens = Math.min(
    request.maxTokens ?? DEFAULT_MAX_TOKENS,
    MAX_TOKENS_CEILING,
  );

  try {
    const message = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      // Drafting a well-scoped task is a judgement call, not an extraction —
      // so thinking stays on, but shaped to what the chosen model accepts.
      thinking:
        capabilities.thinking === "adaptive"
          ? { type: "adaptive" }
          : {
              type: "enabled",
              // Must stay under max_tokens, which is now per-surface.
              budget_tokens: Math.min(
                THINKING_BUDGET_TOKENS,
                Math.floor(maxTokens / 2),
              ),
            },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      // effort and format share one object — keep them together, or the
      // second output_config silently drops the first.
      output_config: {
        format: zodOutputFormat(request.schema),
        ...(capabilities.effort ? { effort: request.effort ?? "low" } : {}),
      },
    });

    const parsed = message.parsed_output ?? null;
    await recordLlmCall({
      surface: request.surface,
      userId,
      model,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      ok: parsed !== null,
    });

    // A refusal returns a normal 200 with no parsed output; treat it as
    // "no suggestion available" like any other miss.
    return parsed;
  } catch (error) {
    // Failed calls are still billed, so they still belong in the ledger —
    // otherwise the cap can be walked straight past by whatever is failing.
    await recordLlmCall({
      surface: request.surface,
      userId,
      model,
      ok: false,
    });
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
