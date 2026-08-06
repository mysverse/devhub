import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSISTANT_TOOL_FAILURE,
  recoverAssistantToolCall,
} from "./assistant-tool-recovery";

test("a failed assistant tool becomes recoverable model context", async () => {
  const failure = new Error("Linear timed out");
  let observed: unknown;
  const result = await recoverAssistantToolCall(
    async () => {
      throw failure;
    },
    (error) => {
      observed = error;
    },
  );
  assert.equal(observed, failure);
  assert.deepEqual(result, ASSISTANT_TOOL_FAILURE);
});

test("a successful assistant tool passes through unchanged", async () => {
  const result = await recoverAssistantToolCall(async () => ({ tasks: 2 }));
  assert.deepEqual(result, { tasks: 2 });
});
