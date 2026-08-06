import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKLOG_SUGGESTION_SCHEMA,
  buildBacklogSuggestionPrompt,
  buildPptDraftPrompt,
  buildTaskReasonPrompt,
  PPT_DRAFT_SCHEMA,
  type PromptDeveloper,
  type PromptIssue,
} from "@/lib/llm-prompts";

const ISSUE: PromptIssue = {
  identifier: "MYS-201",
  title: "Script ticket gate for rapid transit entrances",
  description: "Riders should tap in at the gate before boarding.",
  labelNames: ["PPT", "Enhancement"],
  estimate: 3,
};

const DEVELOPER: PromptDeveloper = {
  ref: "dev-1",
  specialties: ["SCRIPTING"],
  developerRank: "DEVELOPER",
};

/**
 * Values that must never reach an external model. These are exactly the
 * fields check-pii guards on the display side; this is the outbound side.
 */
const PII = [
  "Alexander Tan Wei Ming",
  "alex@example.com",
  "12 Jalan Cempaka, 50450 Kuala Lumpur",
  "514812345678",
  "0198765432",
];

function assertNoPii(prompt: string) {
  for (const secret of PII) {
    assert.ok(
      !prompt.includes(secret),
      `prompt leaked PII: ${secret.slice(0, 20)}`,
    );
  }
}

describe("prompt inputs cannot carry PII", () => {
  it("has no field for a legal name, email, address, or bank detail", () => {
    // A compile-time guarantee expressed as a runtime check: the prompt input
    // types carry issue text and specialty enums only, so there is nowhere to
    // put PII even by mistake. If someone widens PromptDeveloper, this fails.
    const developerFields = Object.keys(DEVELOPER);
    assert.deepEqual(developerFields.sort(), [
      "developerRank",
      "ref",
      "specialties",
    ]);
    const issueFields = Object.keys(ISSUE);
    assert.deepEqual(issueFields.sort(), [
      "description",
      "estimate",
      "identifier",
      "labelNames",
      "title",
    ]);
  });

  it("keeps PII out of the PPT draft prompt", () => {
    assertNoPii(buildPptDraftPrompt(ISSUE));
  });

  it("keeps PII out of the backlog prompt", () => {
    assertNoPii(buildBacklogSuggestionPrompt([ISSUE], [DEVELOPER]));
  });

  it("keeps PII out of the task reason prompt", () => {
    assertNoPii(
      buildTaskReasonPrompt(
        ISSUE,
        DEVELOPER,
        "matches your Scripting specialty",
      ),
    );
  });

  it("identifies developers by opaque ref, never by name", () => {
    const prompt = buildBacklogSuggestionPrompt([ISSUE], [DEVELOPER]);
    assert.match(prompt, /dev-1/);
  });
});

describe("prompt content", () => {
  it("includes what the model needs to scope the task", () => {
    const prompt = buildPptDraftPrompt(ISSUE);
    assert.match(prompt, /MYS-201/);
    assert.match(prompt, /rapid transit/);
    assert.match(prompt, /PPT, Enhancement/);
  });

  it("handles a missing description and estimate", () => {
    const prompt = buildPptDraftPrompt({
      ...ISSUE,
      description: null,
      estimate: null,
    });
    assert.match(prompt, /\(none\)/);
    assert.match(prompt, /\(unset\)/);
  });

  it("says so when there is no roster to match against", () => {
    const prompt = buildBacklogSuggestionPrompt([ISSUE], []);
    assert.match(prompt, /no developers available/);
  });
});

describe("output schemas", () => {
  it("bounds the estimate to DevHub's 1-5 complexity scale", () => {
    const base = {
      title: "Add the gate",
      scope: "Scope.",
      acceptanceCriteria: ["Gate blocks entry without a ticket."],
      specialty: "SCRIPTING" as const,
      reasoning: "Contained scripting change.",
    };
    assert.ok(PPT_DRAFT_SCHEMA.safeParse({ ...base, estimate: 3 }).success);
    assert.ok(!PPT_DRAFT_SCHEMA.safeParse({ ...base, estimate: 0 }).success);
    assert.ok(!PPT_DRAFT_SCHEMA.safeParse({ ...base, estimate: 6 }).success);
  });

  it("lets the backlog triage decline an issue and match nobody", () => {
    const parsed = BACKLOG_SUGGESTION_SCHEMA.safeParse({
      suggestions: [
        {
          identifier: "MYS-9",
          suitable: false,
          reason: "Open-ended chore with no end state.",
          estimate: null,
          specialty: null,
          developerRef: null,
        },
      ],
    });
    assert.ok(parsed.success);
  });
});
