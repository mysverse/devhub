import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASSISTANT_TOOLS } from "@/lib/assistant-tool-definitions";
import { openAiAssistantTools } from "@/lib/openai-assistant-tools";

describe("assistant tool policy", () => {
  it("makes every write a proposal and exposes no money/compliance tool", () => {
    const mutations = ASSISTANT_TOOLS.filter((tool) => tool.mutation);
    assert.ok(mutations.length > 0);
    assert.ok(mutations.every((tool) => tool.name.startsWith("propose_")));
    const names = ASSISTANT_TOOLS.map((tool) => tool.name).join(" ");
    assert.doesNotMatch(names, /payout|payment|kyc|bank|access|delete|bulk/);
    assert.ok(
      ASSISTANT_TOOLS.every(
        (tool) => tool.activity.running && tool.activity.complete,
      ),
    );
  });

  it("strips labels and estimates from ordinary issue proposals", () => {
    const create = ASSISTANT_TOOLS.find(
      (tool) => tool.name === "propose_create_task",
    );
    assert.ok(create);
    const parsed = create.schema.parse({
      title: "Audit spawn points",
      description: null,
      teamId: "team-1",
      projectId: null,
      dueDate: null,
      labels: ["PPT"],
      estimate: 5,
    }) as Record<string, unknown>;
    assert.equal("labels" in parsed, false);
    assert.equal("estimate" in parsed, false);
  });

  it("emits OpenAI strict tool schemas without unsupported formats", () => {
    const schemas = JSON.stringify(openAiAssistantTools());

    assert.doesNotMatch(schemas, /"format":/);
    assert.doesNotMatch(schemas, /linearIssueIdentifier|linearIssueUrl/);
  });
});
