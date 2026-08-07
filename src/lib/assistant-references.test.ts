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
        payout: null,
      },
    ]);
  });

  it("keeps the server-priced payout attached to a PPT reference", () => {
    const payout = {
      currency: "MYR",
      baseAmount: 60,
      amount: 180,
      baseLabel: "RM60.00",
      amountLabel: "RM180.00",
      multiplier: 3,
      campaign: {
        slug: "sprint-boost",
        name: "Sprint Boost",
        multiplier: 3,
        accentColor: "violet",
        endsAt: "2026-08-11T00:00:00.000Z",
      },
    };
    const ref = assistantReferencesFromToolResult("list_open_ppts", {
      ...issue,
      payout,
    })[0];
    assert.equal(ref?.kind, "linear_issue");
    assert.deepEqual(ref?.kind === "linear_issue" ? ref.payout : null, payout);
  });

  it("ignores non-issue tools and untrusted image hosts", () => {
    assert.deepEqual(
      assistantReferencesFromToolResult("list_teams", issue),
      [],
    );
    const ref2 = assistantReferencesFromToolResult("search_tasks", {
      ...issue,
      description: "![Nope](https://example.com/private.png)",
    })[0];
    assert.equal(
      ref2?.kind === "linear_issue" ? ref2.imageUrl : undefined,
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
