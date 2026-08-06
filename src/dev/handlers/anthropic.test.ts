import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { handleAnthropic } from "./anthropic";

function mockClient() {
  return new Anthropic({
    apiKey: "dev-mode-test-key",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      return handleAnthropic(request, new URL(request.url));
    },
  });
}

test("Anthropic dev mock supports the streamed fallback path", async () => {
  const stream = mockClient().messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 200,
    messages: [{ role: "user", content: "Test fallback" }],
  });
  let streamed = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      streamed += event.delta.text;
    }
  }
  const message = await stream.finalMessage();
  assert.match(streamed, /switched to the backup/i);
  assert.equal(message.stop_reason, "end_turn");
  assert.equal(message.content[0]?.type, "text");
});

test("Anthropic fallback can continue with assistant tools", async () => {
  const stream = mockClient().messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content:
          "Make a Proton X90 civilian car for Lebuhraya. Due 2026-08-31, estimate 3.",
      },
    ],
  });
  for await (const _event of stream) {
    // Exercise the exact SDK accumulator used by the agent.
  }
  const message = await stream.finalMessage();
  const call = message.content.find((block) => block.type === "tool_use");
  assert.ok(call);
  assert.equal(call.name, "resolve_task_destination");
  assert.deepEqual(call.input, { query: "Lebuhraya" });
  assert.equal(message.stop_reason, "tool_use");
});
