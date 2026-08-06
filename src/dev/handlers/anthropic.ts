/**
 * Mock Anthropic Messages API. Dev mode must never make a real model call —
 * it would cost money, need a key nobody shares, and make runs
 * non-deterministic.
 *
 * Returns a fixed, schema-shaped draft derived from the prompt, so the
 * structured-output plumbing (parse, validation, the admin form prefill) is
 * genuinely exercised end to end. It is deliberately obvious that a human
 * wrote this: nothing here should be mistaken for model quality.
 */

import type { DevHandler } from "@/dev/intercept";
import { getDevState } from "@/dev/state";

type MessageRequest = {
  system?: string;
  messages?: { role: string; content: unknown }[];
  output_config?: { format?: { schema?: Record<string, unknown> } };
  stream?: boolean;
};

function promptText(body: MessageRequest) {
  return (
    body.messages
      ?.map((message) =>
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
      )
      .join("\n") ?? ""
  );
}

function streamReply(id: string, text: string) {
  const model = "claude-sonnet-5";
  const events = [
    {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [],
        container: null,
        stop_details: null,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          inference_geo: null,
          input_tokens: 12,
          output_tokens: 0,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: "standard",
        },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "", citations: null },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: {
        container: null,
        stop_details: null,
        stop_reason: "end_turn",
        stop_sequence: null,
      },
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 12,
        output_tokens: 18,
        output_tokens_details: null,
        server_tool_use: null,
      },
    },
    { type: "message_stop" },
  ];
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function field(prompt: string, label: string) {
  return new RegExp(`^${label}: (.*)$`, "m").exec(prompt)?.[1]?.trim() ?? "";
}

/** Which canned response fits, based on the schema the caller asked for. */
export function buildReply(body: MessageRequest) {
  const prompt = promptText(body);
  const properties =
    (body.output_config?.format?.schema?.properties as
      | Record<string, unknown>
      | undefined) ?? {};

  if ("suggestions" in properties) {
    const identifiers = [...prompt.matchAll(/^identifier: (.+)$/gm)].map(
      (match) => match[1].trim(),
    );
    return {
      suggestions: identifiers.map((identifier, index) => ({
        identifier,
        // Alternate so both branches of the review queue are reachable.
        suitable: index % 2 === 0,
        reason:
          index % 2 === 0
            ? "Self-contained and verifiable in-game (dev-mode canned reply)."
            : "Open-ended with no checkable end state (dev-mode canned reply).",
        estimate: index % 2 === 0 ? 2 : null,
        specialty: index % 2 === 0 ? "SCRIPTING" : null,
        developerRef: index % 2 === 0 ? "dev-1" : null,
      })),
    };
  }

  if ("ideas" in properties) {
    // Echo back real identifiers from the prompt as "existing", plus one
    // "original", so BOTH branches of the ideas console are reachable — and so
    // the server's re-anchoring (identifier must match what was sent) is
    // actually exercised rather than trivially passing.
    const identifiers = [...prompt.matchAll(/^identifier: (.+)$/gm)]
      .map((match) => match[1].trim())
      .slice(0, 2);
    return {
      ideas: [
        ...identifiers.map((identifier, index) => ({
          kind: "existing",
          identifier,
          title: `Pick up ${identifier} (dev-mode canned reply)`,
          scope: "Dev-mode canned idea anchored to a real backlog issue.",
          acceptanceCriteria: ["The change is visible in-game."],
          estimate: index + 1,
          specialty: "SCRIPTING",
          because: "Lines up with what you have been working on.",
        })),
        {
          kind: "original",
          // Deliberately null: an original idea has no Linear issue.
          identifier: null,
          title: "Add a spawn-point audit tool (dev-mode canned reply)",
          scope: "Dev-mode canned idea with no backlog issue behind it.",
          acceptanceCriteria: ["Tool lists every spawn point in the place."],
          estimate: 3,
          specialty: "SCRIPTING",
          because: "Nothing on the board covers this yet.",
        },
        {
          kind: "existing",
          // Not in the backlog we sent — the server must demote this to
          // "original" rather than trust it.
          identifier: "MYS-DOES-NOT-EXIST",
          title: "Hallucinated anchor (dev-mode canned reply)",
          scope: "Exercises the re-anchoring guard.",
          acceptanceCriteria: ["Should arrive as an original idea."],
          estimate: 2,
          specialty: null,
          because: "Should not be linked to any issue.",
        },
      ],
    };
  }

  if ("reason" in properties) {
    return {
      reason:
        "Lines up with what you've been working on (dev-mode canned reply).",
    };
  }

  const title = field(prompt, "title");
  const estimate = Number.parseInt(field(prompt, "current estimate"), 10);
  return {
    title: title || "Draft task (dev-mode canned reply)",
    scope: `Dev-mode canned draft for ${field(prompt, "identifier") || "this issue"}. No model was called.`,
    acceptanceCriteria: [
      "The change is visible in-game at the described location.",
      "A proof comment links to a screenshot or clip.",
    ],
    estimate:
      Number.isFinite(estimate) && estimate >= 1 && estimate <= 5
        ? estimate
        : 2,
    specialty: "SCRIPTING",
    reasoning: "Dev-mode canned reply — not a real estimate.",
  };
}

export const handleAnthropic: DevHandler = async (req, url) => {
  if (url.pathname === "/v1/messages" && req.method === "POST") {
    const body = (await req.json()) as MessageRequest;
    const id = `msg_dev_${++getDevState().counters.llm}`;
    if (body.stream) {
      console.log(`[dev-mode] anthropic → canned streamed reply (${id})`);
      return streamReply(
        id,
        "OpenAI paused, so I switched to the backup. We can keep going.",
      );
    }

    console.log(`[dev-mode] anthropic → canned structured reply (${id})`);

    const reply = buildReply(body);
    return Response.json({
      id,
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      content: [{ type: "text", text: JSON.stringify(reply) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  }

  throw new Error(
    `[dev-mode] Mock Anthropic: unhandled ${req.method} ${url.pathname}. Add it in src/dev/handlers/anthropic.ts`,
  );
};
