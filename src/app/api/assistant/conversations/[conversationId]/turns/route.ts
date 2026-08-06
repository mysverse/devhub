import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  finishAssistantMessage,
  getAssistantActionDto,
  prepareAssistantTurn,
} from "@/lib/assistant";
import type { AssistantStreamEvent } from "@/lib/assistant-types";
import { getSession } from "@/lib/auth-utils";
import { isAssistantConfigured } from "@/lib/llm";
import { runAssistantTurn } from "@/lib/llm-agent";

type Params = Promise<{ conversationId: string }>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);
  if (!isAssistantConfigured())
    return jsonError("The assistant is not configured.", 503);

  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }
  if (typeof body.content !== "string")
    return jsonError("Message is required.", 400);

  const { conversationId } = await params;
  let prepared: Awaited<ReturnType<typeof prepareAssistantTurn>>;
  try {
    prepared = await prepareAssistantTurn(userId, conversationId, body.content);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "The message could not be sent.",
      400,
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";
      let provider: string | null = null;
      let model: string | null = null;
      let closed = false;
      const send = (event: AssistantStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send({
        type: "start",
        userMessage: prepared.userMessage,
        message: prepared.assistantMessage,
      });

      try {
        const result = await runAssistantTurn({
          userId,
          conversationId,
          messageId: prepared.assistantMessage.id,
          runId: randomUUID(),
          history: prepared.history,
          isAdmin: prepared.isAdmin,
          redactText: prepared.redact,
          signal: request.signal,
          onEvent: async (event) => {
            if (event.type === "delta") {
              accumulated += event.delta;
              send(event);
              return;
            }
            if (event.type === "provider") {
              provider = event.provider;
              model = event.model;
              send(event);
              return;
            }
            const action = await getAssistantActionDto(userId, event.actionId);
            if (action) send({ type: "action", action });
          },
        });
        const content = result.content.trim() || accumulated.trim();
        const message = await finishAssistantMessage({
          messageId: prepared.assistantMessage.id,
          userId,
          content: content || "I prepared the action for your review.",
          status: "COMPLETE",
          provider: result.provider,
          model: result.model,
        });
        send({ type: "done", message });
      } catch (error) {
        const interrupted = request.signal.aborted;
        const publicMessage = interrupted
          ? "Reply interrupted."
          : error instanceof Error
            ? error.message
            : "The assistant is temporarily unavailable.";
        const message = await finishAssistantMessage({
          messageId: prepared.assistantMessage.id,
          userId,
          content: accumulated || publicMessage,
          status: interrupted ? "INTERRUPTED" : "FAILED",
          provider,
          model,
        });
        send({ type: "error", error: publicMessage, message });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
