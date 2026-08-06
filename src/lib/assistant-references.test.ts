import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assistantReferencesFromToolResult } from "./assistant-references";

const issue = {
  id: "issue-mys-201",
  identifier: "MYS-201",
  title: "Implement convoy escort mission flow",
  url: "https://linear.app/mysverse/issue/MYS-201",
  description:
    "![Preview](https://uploads.linear.app/example/car.png)\nBuild the full convoy flow.",
  estimate: 3,
  stateName: "In Progress",
  labelNames: ["PPT", "Vehicles"],
};

describe("assistant Linear references", () => {
  it("turns safe issue tool output into a rich card", () => {
    assert.deepEqual(assistantReferencesFromToolResult("get_task", issue), [
      {
        kind: "linear_issue",
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: "Build the full convoy flow.",
        estimate: 3,
        stateName: "In Progress",
        labelNames: ["PPT", "Vehicles"],
        imageUrl: "https://uploads.linear.app/example/car.png",
      },
    ]);
  });

  it("ignores non-issue tools and untrusted image hosts", () => {
    assert.deepEqual(
      assistantReferencesFromToolResult("list_teams", issue),
      [],
    );
    assert.equal(
      assistantReferencesFromToolResult("search_tasks", {
        ...issue,
        description: "![Nope](https://example.com/private.png)",
      })[0]?.imageUrl,
      null,
    );
  });

  it("caps a noisy search result", () => {
    const references = assistantReferencesFromToolResult(
      "search_tasks",
      Array.from({ length: 10 }, (_, index) => ({
        ...issue,
        id: `issue-${index}`,
        identifier: `MYS-${index}`,
      })),
    );
    assert.equal(references.length, 6);
  });
});
