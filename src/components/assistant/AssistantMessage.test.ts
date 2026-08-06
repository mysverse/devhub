import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessageDto } from "@/lib/assistant-types";
import { assistantReplySuggestions } from "./assistant-suggestions";

function message(content: string): AssistantMessageDto {
  return {
    id: "message-1",
    role: "assistant",
    content,
    status: "COMPLETE",
    provider: "openai",
    model: "gpt-5.6-luna",
    createdAt: "2026-08-07T00:00:00.000Z",
    actions: [],
    references: [],
  };
}

describe("assistant reply suggestions", () => {
  it("moves a working draft toward a task instead of another questionnaire", () => {
    assert.deepEqual(
      assistantReplySuggestions(message("**Working draft**\n\nBuild one car.")),
      ["Make this a PPT", "Create an ordinary task"],
    );
  });

  it("does not offer duplicate actions after a proposal exists", () => {
    const draft = message("Working draft");
    draft.actions.push({
      id: "action-1",
      kind: "ppt_request",
      payload: {},
      preview: { title: "Review", description: "Review" },
      status: "PENDING",
      expiresAt: "2026-08-07T01:00:00.000Z",
      executedAt: null,
      result: null,
      error: null,
    });
    assert.deepEqual(assistantReplySuggestions(draft), []);
  });
});
