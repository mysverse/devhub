import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantSystemPrompt } from "./assistant-system-prompt";

describe("assistant conversation policy", () => {
  const prompt = assistantSystemPrompt(false, new Date("2026-08-07T00:00:00Z"));

  it("instructs immediate card creation for explicit requests", () => {
    assert.match(prompt, /fastest path from an idea to a confirmed action/);
    assert.match(prompt, /call propose_ppt_request immediately/);
    assert.match(prompt, /call propose_create_bonus_task immediately/);
    assert.match(prompt, /call propose_create_task immediately/);
  });

  it("routes generic ideas to task_draft with editable inferred fields", () => {
    assert.match(prompt, /call the task_draft presentation tool/);
    assert.match(
      prompt,
      /Do NOT prompt the user with a conversational questionnaire/,
    );
    assert.match(prompt, /keep your prose under 50 words/);
  });

  it("resolves named products without a team-project tool loop", () => {
    assert.match(prompt, /Use resolve_task_destination/);
    assert.match(prompt, /Lebuhraya/);
    assert.match(prompt, /Today is 2026-08-07/);
  });
});
