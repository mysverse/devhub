import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { openAiAssistantTools } from "@/lib/openai-assistant-tools";
import { openAiResponseOutputAsInput } from "@/lib/openai-response-replay";
import { handleOpenAi } from "./openai";

const MODEL = "gpt-5.6-luna";

function mockClient() {
  return new OpenAI({
    apiKey: "dev-mode-test-key",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      return handleOpenAi(request, new URL(request.url));
    },
  });
}

test("OpenAI tool replay removes SDK-only parsed arguments", async () => {
  const client = mockClient();
  const tools = openAiAssistantTools();
  const stream = client.responses.stream({
    model: MODEL,
    input: [{ role: "user", content: "Show my assigned tasks" }],
    tools,
    store: false,
  });
  for await (const _event of stream) {
    // Consume the same stream path used by the assistant agent.
  }
  const first = await stream.finalResponse();
  const call = first.output.find((item) => item.type === "function_call");
  assert.ok(call);
  assert.equal("parsed_arguments" in call, true);

  const result: ResponseInputItem = {
    type: "function_call_output",
    call_id: call.call_id,
    output: JSON.stringify({ tasks: [] }),
  };
  const unsafeInput = [
    ...(first.output as unknown as ResponseInputItem[]),
    result,
  ];
  await assert.rejects(
    client.responses.create({
      model: MODEL,
      input: unsafeInput,
      tools,
      store: false,
    }),
    /Unknown parameter: 'input\[0\]\.parsed_arguments'/,
  );

  const safeInput = [...openAiResponseOutputAsInput(first.output), result];
  assert.doesNotMatch(JSON.stringify(safeInput), /parsed_arguments|"parsed":/);
  const second = await client.responses.create({
    model: MODEL,
    input: safeInput,
    tools,
    store: false,
  });
  assert.equal(second.status, "completed");
  assert.match(second.output_text, /checked the current DevHub data/i);
});
