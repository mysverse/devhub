import type Anthropic from "@anthropic-ai/sdk";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import * as z from "zod/v4";
import { assistantReferencesFromToolResult } from "@/lib/assistant-references";
import { assistantSystemPrompt } from "@/lib/assistant-system-prompt";
import { recoverAssistantToolCall } from "@/lib/assistant-tool-recovery";
import {
  ASSISTANT_TOOLS,
  assistantToolByName,
  executeAssistantTool,
} from "@/lib/assistant-tools";
import type { AssistantReferenceDto } from "@/lib/assistant-types";
import {
  checkLlmRateLimits,
  getAnthropicClient,
  getLlmProviderOrder,
  getOpenAiClient,
  isFallbackEligible,
  type LlmProvider,
  llmFailureKind,
  recordLlmCall,
  resolveLlmModel,
  resolveOpenAiModel,
  safetyIdentifier,
} from "@/lib/llm";
import { openAiAssistantTools } from "@/lib/openai-assistant-tools";
import { openAiResponseOutputAsInput } from "@/lib/openai-response-replay";

const MAX_TOOL_ROUNDS = 6;
const MAX_OUTPUT_TOKENS = 2_500;

export type AssistantHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantAgentEvent =
  | { type: "delta"; delta: string }
  | { type: "action"; actionId: string }
  | { type: "provider"; provider: LlmProvider; model: string }
  | { type: "references"; references: AssistantReferenceDto[] }
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      phase: "running" | "complete" | "error";
      label: string;
      detail?: string;
    };

export type RunAssistantTurnInput = {
  userId: string;
  conversationId: string;
  messageId: string;
  runId: string;
  history: AssistantHistoryMessage[];
  isAdmin: boolean;
  redactText?: (text: string) => string;
  signal?: AbortSignal;
  onEvent: (event: AssistantAgentEvent) => void | Promise<void>;
};

export type AssistantAgentResult = {
  content: string;
  provider: LlmProvider;
  model: string;
  actionIds: string[];
};

function actionIdFrom(result: unknown) {
  if (!result || typeof result !== "object" || !("actionId" in result)) {
    return null;
  }
  const value = (result as { actionId?: unknown }).actionId;
  return typeof value === "string" ? value : null;
}

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item instanceof Date ? item.toISOString() : item,
  );
}

function toolResultDetail(result: unknown) {
  if (Array.isArray(result)) {
    return `${result.length} ${result.length === 1 ? "result" : "results"}`;
  }
  if (!result || typeof result !== "object") return undefined;
  const row = result as Record<string, unknown>;
  if (typeof row.error === "string") return "Couldn’t finish this check";
  if (row.confirmationRequired === true) return "Waiting for your confirmation";
  if (row.success === true) return "Done";
  return undefined;
}

async function executeAgentTool(
  name: string,
  toolInput: unknown,
  toolCallId: string,
  input: RunAssistantTurnInput,
) {
  const copy = assistantToolByName(name)?.activity ?? {
    running: "Checking DevHub",
    complete: "Check complete",
  };
  await input.onEvent({
    type: "tool",
    toolCallId,
    name,
    phase: "running",
    label: copy.running,
  });
  let toolError: unknown;
  const result = await recoverAssistantToolCall(
    () =>
      executeAssistantTool(name, toolInput, {
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        toolCallId,
      }),
    (error) => {
      toolError = error;
    },
  );
  if (toolError) {
    await input.onEvent({
      type: "tool",
      toolCallId,
      name,
      phase: "error",
      label: "That check didn’t work",
      detail: "Trying another route",
    });
    console.warn(
      `[assistant] ${name} tool failed:`,
      toolError instanceof Error ? toolError.message : toolError,
    );
    return result;
  }
  const references = assistantReferencesFromToolResult(name, result);
  if (references.length > 0) {
    await input.onEvent({ type: "references", references });
  }
  const failed =
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string";
  await input.onEvent({
    type: "tool",
    toolCallId,
    name,
    phase: failed ? "error" : "complete",
    label: failed ? "That check didn’t work" : copy.complete,
    detail: toolResultDetail(result),
  });
  return result;
}

function anthropicTools(): Anthropic.Messages.Tool[] {
  return ASSISTANT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(
      tool.schema,
    ) as Anthropic.Messages.Tool.InputSchema,
    strict: true,
  }));
}

type ProviderAttempt =
  | { kind: "success"; result: AssistantAgentResult; callId: string | null }
  | {
      kind: "retry";
      callId: string | null;
      hadOutput: boolean;
      hadAction: boolean;
    }
  | { kind: "stop"; callId: string | null };

async function runOpenAi(
  input: RunAssistantTurnInput,
  fallbackFromId: string | null,
): Promise<ProviderAttempt> {
  const client = getOpenAiClient();
  if (!client) {
    return {
      kind: "retry",
      callId: fallbackFromId,
      hadOutput: false,
      hadAction: false,
    };
  }
  const model = resolveOpenAiModel();
  await input.onEvent({ type: "provider", provider: "openai", model });
  const items: ResponseInputItem[] = input.history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const actionIds: string[] = [];
  let content = "";
  let lastCallId = fallbackFromId;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const providerFallbackId = round === 0 ? fallbackFromId : null;
    const limit = await checkLlmRateLimits(input.userId, { chat: true });
    if (limit.limited) {
      return content || actionIds.length
        ? { kind: "stop", callId: lastCallId }
        : {
            kind: "retry",
            callId: lastCallId,
            hadOutput: false,
            hadAction: false,
          };
    }
    const startedAt = Date.now();
    try {
      const stream = client.responses.stream(
        {
          model,
          instructions: assistantSystemPrompt(input.isAdmin),
          input: items,
          tools: openAiAssistantTools(),
          max_output_tokens: MAX_OUTPUT_TOKENS,
          reasoning: { effort: "low", context: "current_turn" },
          text: { verbosity: "medium" },
          parallel_tool_calls: false,
          safety_identifier: safetyIdentifier(input.userId),
          store: false,
        },
        { signal: input.signal },
      );
      let refused = false;
      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          content += event.delta;
          await input.onEvent({ type: "delta", delta: event.delta });
        }
        if (event.type === "response.refusal.delta") refused = true;
      }
      const response = await stream.finalResponse();
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "openai",
        model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cachedInputTokens: response.usage?.input_tokens_details.cached_tokens,
        reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens,
        latencyMs: Date.now() - startedAt,
        failureKind: refused ? "refusal" : null,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: providerFallbackId,
        ok: !refused,
      });
      if (refused) return { kind: "stop", callId: lastCallId };

      items.push(...openAiResponseOutputAsInput(response.output));
      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );
      if (calls.length === 0) {
        return {
          kind: "success",
          callId: lastCallId,
          result: { content, provider: "openai", model, actionIds },
        };
      }
      for (const call of calls) {
        let toolInput: unknown = {};
        try {
          toolInput = JSON.parse(call.arguments);
        } catch {
          toolInput = {};
        }
        const result = await executeAgentTool(
          call.name,
          toolInput,
          call.call_id,
          input,
        );
        const actionId = actionIdFrom(result);
        if (actionId && !actionIds.includes(actionId)) {
          actionIds.push(actionId);
          await input.onEvent({ type: "action", actionId });
        }
        items.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: input.redactText?.(json(result)) ?? json(result),
        });
      }
    } catch (error) {
      const kind = llmFailureKind(error);
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "openai",
        model,
        latencyMs: Date.now() - startedAt,
        failureKind: kind,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: providerFallbackId,
        ok: false,
      });
      console.warn(
        "[assistant] OpenAI turn failed:",
        error instanceof Error ? error.message : error,
      );
      if (!isFallbackEligible(kind))
        return { kind: "stop", callId: lastCallId };
      return {
        kind: "retry",
        callId: lastCallId,
        hadOutput: Boolean(content),
        hadAction: actionIds.length > 0,
      };
    }
  }

  // If tool rounds completed without generating prose content, run one final synthesis turn
  if (!content.trim()) {
    const startedAt = Date.now();
    try {
      const stream = client.responses.stream(
        {
          model,
          instructions: assistantSystemPrompt(input.isAdmin),
          input: items,
          tools: [], // No tools during synthesis pass
          max_output_tokens: MAX_OUTPUT_TOKENS,
          reasoning: { effort: "low", context: "current_turn" },
          text: { verbosity: "medium" },
          parallel_tool_calls: false,
          safety_identifier: safetyIdentifier(input.userId),
          store: false,
        },
        { signal: input.signal },
      );
      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          content += event.delta;
          await input.onEvent({ type: "delta", delta: event.delta });
        }
      }
      const response = await stream.finalResponse();
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "openai",
        model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cachedInputTokens: response.usage?.input_tokens_details.cached_tokens,
        reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens,
        latencyMs: Date.now() - startedAt,
        failureKind: null,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: lastCallId,
        ok: true,
      });
    } catch (error) {
      console.warn("[assistant] OpenAI synthesis pass failed:", error);
    }
  }

  return {
    kind: "success",
    callId: lastCallId,
    result: { content, provider: "openai", model, actionIds },
  };
}

async function runAnthropic(
  input: RunAssistantTurnInput,
  fallbackFromId: string | null,
): Promise<ProviderAttempt> {
  const client = getAnthropicClient();
  if (!client) {
    return {
      kind: "retry",
      callId: fallbackFromId,
      hadOutput: false,
      hadAction: false,
    };
  }
  const model = resolveLlmModel();
  await input.onEvent({ type: "provider", provider: "anthropic", model });
  const messages: Anthropic.Messages.MessageParam[] = input.history.map(
    (message) => ({ role: message.role, content: message.content }),
  );
  const actionIds: string[] = [];
  let content = "";
  let lastCallId = fallbackFromId;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const providerFallbackId = round === 0 ? fallbackFromId : null;
    const limit = await checkLlmRateLimits(input.userId, { chat: true });
    if (limit.limited) return { kind: "stop", callId: lastCallId };
    const startedAt = Date.now();
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: assistantSystemPrompt(input.isAdmin),
          messages,
          tools: anthropicTools(),
          tool_choice: { type: "auto", disable_parallel_tool_use: true },
        },
        { signal: input.signal },
      );
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta" &&
          event.delta.text
        ) {
          content += event.delta.text;
          await input.onEvent({ type: "delta", delta: event.delta.text });
        }
      }
      const message = await stream.finalMessage();
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "anthropic",
        model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        failureKind: message.stop_reason === "refusal" ? "refusal" : null,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: providerFallbackId,
        ok: message.stop_reason !== "refusal",
      });
      if (message.stop_reason === "refusal") {
        return { kind: "stop", callId: lastCallId };
      }
      messages.push({ role: "assistant", content: message.content });
      const calls = message.content.filter(
        (block) => block.type === "tool_use",
      );
      if (calls.length === 0) {
        return {
          kind: "success",
          callId: lastCallId,
          result: { content, provider: "anthropic", model, actionIds },
        };
      }
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const result = await executeAgentTool(
          call.name,
          call.input,
          call.id,
          input,
        );
        const actionId = actionIdFrom(result);
        if (actionId && !actionIds.includes(actionId)) {
          actionIds.push(actionId);
          await input.onEvent({ type: "action", actionId });
        }
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: input.redactText?.(json(result)) ?? json(result),
        });
      }
      messages.push({ role: "user", content: results });
    } catch (error) {
      const kind = llmFailureKind(error);
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "anthropic",
        model,
        latencyMs: Date.now() - startedAt,
        failureKind: kind,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: providerFallbackId,
        ok: false,
      });
      console.warn(
        "[assistant] Anthropic turn failed:",
        error instanceof Error ? error.message : error,
      );
      if (!isFallbackEligible(kind))
        return { kind: "stop", callId: lastCallId };
      return {
        kind: "retry",
        callId: lastCallId,
        hadOutput: Boolean(content),
        hadAction: actionIds.length > 0,
      };
    }
  }

  // If tool rounds completed without generating prose content, run one final synthesis turn
  if (!content.trim()) {
    const startedAt = Date.now();
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: assistantSystemPrompt(input.isAdmin),
          messages,
          tools: [], // No tools during synthesis pass
        },
        { signal: input.signal },
      );
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta" &&
          event.delta.text
        ) {
          content += event.delta.text;
          await input.onEvent({ type: "delta", delta: event.delta.text });
        }
      }
      const message = await stream.finalMessage();
      lastCallId = await recordLlmCall({
        surface: "assistant_chat",
        userId: input.userId,
        provider: "anthropic",
        model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        failureKind: null,
        conversationId: input.conversationId,
        runId: input.runId,
        fallbackFromId: lastCallId,
        ok: true,
      });
    } catch (error) {
      console.warn("[assistant] Anthropic synthesis pass failed:", error);
    }
  }

  return {
    kind: "success",
    callId: lastCallId,
    result: { content, provider: "anthropic", model, actionIds },
  };
}

export async function runAssistantTurn(
  input: RunAssistantTurnInput,
): Promise<AssistantAgentResult> {
  const providers = getLlmProviderOrder();
  let fallbackFromId: string | null = null;
  for (const provider of providers) {
    const attempt: ProviderAttempt =
      provider === "openai"
        ? await runOpenAi(input, fallbackFromId)
        : await runAnthropic(input, fallbackFromId);
    if (attempt.kind === "success") return attempt.result;
    if (attempt.kind === "stop") break;
    if (attempt.hadOutput || attempt.hadAction) break;
    fallbackFromId = attempt.callId;
  }
  throw new Error(
    "The assistant is temporarily unavailable. Please try again.",
  );
}
