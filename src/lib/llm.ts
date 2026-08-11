import { createHash, createHmac } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type * as z from "zod/v4";
import prisma from "@/lib/prisma";

// Every external model call crosses this boundary. Providers may differ in
// request shape, but callers retain one optional contract: a typed answer or
// null, with usage recorded for every billed attempt.

const ANTHROPIC_MODELS = {
  "claude-sonnet-5": { thinking: "adaptive", effort: true },
  "claude-haiku-4-5": { thinking: "budget", effort: false },
  "claude-opus-5": { thinking: "adaptive", effort: true },
} as const satisfies Record<
  string,
  { thinking: "adaptive" | "budget"; effort: boolean }
>;

export type LlmProvider = "openai" | "anthropic";
export type LlmModel = keyof typeof ANTHROPIC_MODELS;

type ProviderResult<Value> =
  | { kind: "success"; value: Value }
  | { kind: "stop" }
  | { kind: "retry"; callId: string | null };

const DEFAULT_ANTHROPIC_MODEL: LlmModel = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_MAX_TOKENS = 2_000;
const MAX_TOKENS_CEILING = 16_000;
const THINKING_BUDGET_TOKENS = 1_024;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS_PER_HOUR = 200;
const DEFAULT_MAX_CALLS_PER_USER_PER_HOUR = 12;
const DEFAULT_MAX_WRITING_CALLS_PER_USER_PER_HOUR = 30;

/**
 * Writing assist is metered on its own ledger, identified by the surface
 * prefix rather than by a column, so `LlmCall` keeps one shape.
 *
 * A polish button sits on a dozen fields; drafting a PPT sits on one. Counting
 * them together means someone who tidies three proof comments finds task ideas
 * unavailable for the rest of the hour — a cap surfacing as a broken feature,
 * which is the one thing metering must never do. Both budgets still sit under
 * the global hourly cap, so total spend is unchanged in the only place that
 * bounds it.
 */
const WRITING_SURFACE_PREFIXES = ["write_", "review_"];

export function resolveLlmModel(): LlmModel {
  const configured = process.env.ANTHROPIC_MODEL;
  if (!configured) return DEFAULT_ANTHROPIC_MODEL;
  if (configured in ANTHROPIC_MODELS) return configured as LlmModel;
  console.warn(
    `[llm] ANTHROPIC_MODEL="${configured}" is not one of ${Object.keys(ANTHROPIC_MODELS).join(", ")} — using ${DEFAULT_ANTHROPIC_MODEL}.`,
  );
  return DEFAULT_ANTHROPIC_MODEL;
}

export function resolveOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function configuredProvider(value: string | undefined): LlmProvider | null {
  return value === "openai" || value === "anthropic" ? value : null;
}

function hasProviderKey(provider: LlmProvider) {
  return provider === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Primary first, followed by at most one explicitly or automatically chosen fallback. */
export function getLlmProviderOrder(): LlmProvider[] {
  const requested = configuredProvider(process.env.LLM_PROVIDER);
  const primary =
    requested ?? (process.env.OPENAI_API_KEY ? "openai" : "anthropic");
  const providers: LlmProvider[] = [];
  if (hasProviderKey(primary)) providers.push(primary);

  const fallbackSetting = process.env.LLM_FALLBACK_PROVIDER?.trim();
  if (fallbackSetting !== "none") {
    const fallback =
      configuredProvider(fallbackSetting) ??
      (primary === "openai" ? "anthropic" : "openai");
    if (fallback !== primary && hasProviderKey(fallback)) {
      providers.push(fallback);
    }
  }
  return providers.slice(0, 2);
}

export function isLlmConfigured() {
  return getLlmProviderOrder().length > 0;
}

export function isAssistantConfigured() {
  const enabled = process.env.LLM_ASSISTANT_ENABLED;
  return enabled !== "false" && isLlmConfigured();
}

let cachedAnthropicClient: Anthropic | null | undefined;
let cachedOpenAiClient: OpenAI | null | undefined;

export function getAnthropicClient(): Anthropic | null {
  if (cachedAnthropicClient !== undefined) return cachedAnthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedAnthropicClient = apiKey
    ? new Anthropic({ apiKey, maxRetries: 0, timeout: 60_000 })
    : null;
  return cachedAnthropicClient;
}

export function getOpenAiClient(): OpenAI | null {
  if (cachedOpenAiClient !== undefined) return cachedOpenAiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  cachedOpenAiClient = apiKey
    ? new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 })
    : null;
  return cachedOpenAiClient;
}

/** Backward-compatible name used by older tests and call sites. */
export function getLlmClient(): Anthropic | null {
  return getAnthropicClient();
}

function getHourlyLimit(name: string, fallback: number) {
  const configured = Number(process.env[name] ?? String(fallback));
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.floor(configured);
}

export type LlmRateLimitScope = "global" | "user";

/**
 * Which per-user ledger a call is counted against. `"writing"` selects the
 * writing budget and counts only `write_*`/`review_*` surfaces; `"default"`
 * counts everything else. The two are disjoint by construction, so neither can
 * starve the other.
 */
export type LlmBudget = "default" | "writing";

/**
 * Whether a surface id spends from the writing budget. The naming rule is the
 * mechanism — a new writing surface opts in by being called `write_*`, and
 * `ai-assist-config.test.ts` asserts every configured field satisfies this.
 */
export function usesWritingBudget(surface: string) {
  return WRITING_SURFACE_PREFIXES.some((prefix) => surface.startsWith(prefix));
}

/**
 * The surface filter for one budget, applied to the per-user count only.
 *
 * Written as `OR` / `NOT: { OR }` rather than a bare `NOT: [...]`, whose
 * list form negates the conjunction — the wrong half of De Morgan, and a
 * silently over-counting cap.
 */
function budgetSurfaceFilter(budget: LlmBudget) {
  const matchesWriting = {
    OR: WRITING_SURFACE_PREFIXES.map((prefix) => ({
      surface: { startsWith: prefix },
    })),
  };
  return budget === "writing" ? matchesWriting : { NOT: matchesWriting };
}

export async function checkLlmRateLimits(
  userId: string | null,
  options: { chat?: boolean; budget?: LlmBudget } = {},
): Promise<{ limited: false } | { limited: true; scope: LlmRateLimitScope }> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const budget: LlmBudget = options.budget ?? "default";
  const globalLimit = getHourlyLimit(
    "LLM_MAX_CALLS_PER_HOUR",
    DEFAULT_MAX_CALLS_PER_HOUR,
  );
  // Chat has its own user-turn gate. The legacy per-user provider-call cap is
  // retained for one-shot drafting surfaces so their established spend shape
  // does not change when agent turns need multiple tool rounds.
  const userLimit = options.chat
    ? 0
    : budget === "writing"
      ? getHourlyLimit(
          "LLM_MAX_WRITING_CALLS_PER_USER_PER_HOUR",
          DEFAULT_MAX_WRITING_CALLS_PER_USER_PER_HOUR,
        )
      : getHourlyLimit(
          "LLM_MAX_CALLS_PER_USER_PER_HOUR",
          DEFAULT_MAX_CALLS_PER_USER_PER_HOUR,
        );

  const [globalCount, userCount] = await Promise.all([
    globalLimit > 0
      ? prisma.llmCall.count({ where: { createdAt: { gte: since } } })
      : Promise.resolve(0),
    userLimit > 0 && userId
      ? prisma.llmCall.count({
          where: {
            userId,
            createdAt: { gte: since },
            ...budgetSurfaceFilter(budget),
          },
        })
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

export type LlmCallRecord = {
  surface: string;
  userId: string | null;
  provider: LlmProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  latencyMs?: number;
  failureKind?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  fallbackFromId?: string | null;
  ok: boolean;
};

/** Never throws: metering must not be able to fail the thing it measures. */
export async function recordLlmCall(
  row: LlmCallRecord,
): Promise<string | null> {
  try {
    const call = await prisma.llmCall.create({
      data: {
        surface: row.surface,
        userId: row.userId,
        provider: row.provider,
        model: row.model,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cachedInputTokens: row.cachedInputTokens ?? 0,
        reasoningTokens: row.reasoningTokens ?? 0,
        latencyMs: row.latencyMs,
        failureKind: row.failureKind ?? null,
        conversationId: row.conversationId ?? null,
        runId: row.runId ?? null,
        fallbackFromId: row.fallbackFromId ?? null,
        ok: row.ok,
      },
      select: { id: true },
    });
    return call.id;
  } catch (error) {
    console.warn(
      "[llm] could not record usage:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function safetyIdentifier(userId: string | null) {
  if (!userId) return undefined;
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret
    ? createHmac("sha256", secret).update(`llm:${userId}`).digest("hex")
    : createHash("sha256").update(`llm:${userId}`).digest("hex");
}

export type LlmRequest<Schema extends z.ZodType> = {
  surface: string;
  userId?: string | null;
  system: string;
  prompt: string;
  schema: Schema;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  conversationId?: string | null;
  runId?: string | null;
  /** Which per-user hourly ledger to count against. Defaults to `"default"`. */
  budget?: LlmBudget;
};

export function llmFailureKind(error: unknown) {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_unavailable";
  if (status >= 400) return "invalid_request";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (
    /abort/i.test(code) ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "aborted";
  }
  if (/timeout|timedout|connection|network|econn/i.test(code)) {
    return "transport";
  }
  return "transport";
}

export function isFallbackEligible(kind: string) {
  return [
    "rate_limit",
    "provider_unavailable",
    "transport",
    "invalid_request",
    "invalid_output",
  ].includes(kind);
}

function schemaName(surface: string) {
  const safe = surface.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return safe || "devhub_result";
}

async function generateWithOpenAi<Schema extends z.ZodType>(
  request: LlmRequest<Schema>,
  maxTokens: number,
  fallbackFromId: string | null,
): Promise<ProviderResult<z.infer<Schema>>> {
  const client = getOpenAiClient();
  if (!client) return { kind: "retry", callId: fallbackFromId };
  const model = resolveOpenAiModel();
  const startedAt = Date.now();
  try {
    const response = await client.responses.parse({
      model,
      instructions: request.system,
      input: request.prompt,
      max_output_tokens: maxTokens,
      reasoning: {
        effort: request.effort ?? "low",
        context: "current_turn",
      },
      text: {
        format: zodTextFormat(request.schema, schemaName(request.surface)),
        verbosity: "medium",
      },
      safety_identifier: safetyIdentifier(request.userId ?? null),
      store: false,
    });
    const refused = response.output.some(
      (item) =>
        item.type === "message" &&
        item.content.some((content) => content.type === "refusal"),
    );
    const parsed = response.output_parsed;
    const kind = refused
      ? "refusal"
      : parsed === null
        ? "invalid_output"
        : null;
    const callId = await recordLlmCall({
      surface: request.surface,
      userId: request.userId ?? null,
      provider: "openai",
      model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      cachedInputTokens: response.usage?.input_tokens_details.cached_tokens,
      reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens,
      latencyMs: Date.now() - startedAt,
      failureKind: kind,
      conversationId: request.conversationId,
      runId: request.runId,
      fallbackFromId,
      ok: parsed !== null && !refused,
    });
    if (refused) return { kind: "stop" };
    if (parsed === null) return { kind: "retry", callId };
    return { kind: "success", value: parsed as z.infer<Schema> };
  } catch (error) {
    const kind = llmFailureKind(error);
    const callId = await recordLlmCall({
      surface: request.surface,
      userId: request.userId ?? null,
      provider: "openai",
      model,
      latencyMs: Date.now() - startedAt,
      failureKind: kind,
      conversationId: request.conversationId,
      runId: request.runId,
      fallbackFromId,
      ok: false,
    });
    console.warn(
      `[llm] OpenAI ${request.surface} failed:`,
      error instanceof Error ? error.message : error,
    );
    return isFallbackEligible(kind)
      ? { kind: "retry", callId }
      : { kind: "stop" };
  }
}

async function generateWithAnthropic<Schema extends z.ZodType>(
  request: LlmRequest<Schema>,
  maxTokens: number,
  fallbackFromId: string | null,
): Promise<ProviderResult<z.infer<Schema>>> {
  const client = getAnthropicClient();
  if (!client) return { kind: "retry", callId: fallbackFromId };
  const model = resolveLlmModel();
  const capabilities = ANTHROPIC_MODELS[model];
  const startedAt = Date.now();
  try {
    const message = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      thinking:
        capabilities.thinking === "adaptive"
          ? { type: "adaptive" }
          : {
              type: "enabled",
              budget_tokens: Math.min(
                THINKING_BUDGET_TOKENS,
                Math.floor(maxTokens / 2),
              ),
            },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      output_config: {
        format: zodOutputFormat(request.schema),
        ...(capabilities.effort ? { effort: request.effort ?? "low" } : {}),
      },
    });
    const parsed = message.parsed_output ?? null;
    const refused = message.stop_reason === "refusal";
    const kind = refused
      ? "refusal"
      : parsed === null
        ? "invalid_output"
        : null;
    const callId = await recordLlmCall({
      surface: request.surface,
      userId: request.userId ?? null,
      provider: "anthropic",
      model,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      latencyMs: Date.now() - startedAt,
      failureKind: kind,
      conversationId: request.conversationId,
      runId: request.runId,
      fallbackFromId,
      ok: parsed !== null && !refused,
    });
    if (refused) return { kind: "stop" };
    if (parsed === null) return { kind: "retry", callId };
    return { kind: "success", value: parsed };
  } catch (error) {
    const kind = llmFailureKind(error);
    const callId = await recordLlmCall({
      surface: request.surface,
      userId: request.userId ?? null,
      provider: "anthropic",
      model,
      latencyMs: Date.now() - startedAt,
      failureKind: kind,
      conversationId: request.conversationId,
      runId: request.runId,
      fallbackFromId,
      ok: false,
    });
    console.warn(
      `[llm] Anthropic ${request.surface} failed:`,
      error instanceof Error ? error.message : error,
    );
    return isFallbackEligible(kind)
      ? { kind: "retry", callId }
      : { kind: "stop" };
  }
}

export async function generateStructured<Schema extends z.ZodType>(
  request: LlmRequest<Schema>,
): Promise<z.infer<Schema> | null> {
  const providers = getLlmProviderOrder();
  if (providers.length === 0) return null;

  const maxTokens = Math.min(
    request.maxTokens ?? DEFAULT_MAX_TOKENS,
    MAX_TOKENS_CEILING,
  );
  let fallbackFromId: string | null = null;

  for (const provider of providers) {
    const limit = await checkLlmRateLimits(request.userId ?? null, {
      budget: request.budget,
    });
    if (limit.limited) {
      console.warn(
        `[llm] ${request.surface} skipped — hourly ${limit.scope} cap reached`,
      );
      return null;
    }

    const result: ProviderResult<z.infer<Schema>> =
      provider === "openai"
        ? await generateWithOpenAi(request, maxTokens, fallbackFromId)
        : await generateWithAnthropic(request, maxTokens, fallbackFromId);
    if (result.kind === "success") return result.value;
    if (result.kind === "stop") return null;
    fallbackFromId = result.callId;
  }
  return null;
}

/** Test seam: forget memoised clients so environment changes take effect. */
export function resetLlmClientForTests() {
  cachedAnthropicClient = undefined;
  cachedOpenAiClient = undefined;
}
