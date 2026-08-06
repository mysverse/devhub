import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantSystemPrompt } from "./assistant-system-prompt";

describe("assistant conversation policy", () => {
  const prompt = assistantSystemPrompt(false, new Date("2026-08-07T00:00:00Z"));

  it("turns rough ideas into a draft before asking questions", () => {
    assert.match(prompt, /immediately write a useful \*\*Working draft\*\*/);
    assert.match(prompt, /Ask at most one material scoping question/);
    assert.match(prompt, /Default to momentum, not an interview/);
  });

  it("collects the remaining PPT decisions together and then proposes", () => {
    assert.match(prompt, /due date and 1-5 estimate may be asked together/i);
    assert.match(prompt, /immediately call propose_ppt_request/);
    assert.match(prompt, /never choose a PPT due date or estimate/i);
  });

  it("resolves named products without a team-project tool loop", () => {
    assert.match(prompt, /Use resolve_task_destination/);
    assert.match(prompt, /Lebuhraya/);
    assert.match(prompt, /Today is 2026-08-07/);
  });
});
