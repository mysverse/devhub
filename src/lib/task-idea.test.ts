import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampEstimate,
  ideaBlockedReason,
  ideaClipboardText,
  ideaDescriptionMarkdown,
  pptRequestPrefillFromIdea,
  rankedTaskToIdea,
  type TaskIdea,
} from "@/lib/task-idea";

function idea(overrides: Partial<TaskIdea> = {}): TaskIdea {
  return {
    ref: "model:0",
    title: "Add a ticket gate to the transit entrance",
    scope: "Riders tap in before boarding.",
    acceptanceCriteria: ["Gate blocks entry without a ticket."],
    estimate: 3,
    specialty: "SCRIPTING",
    because: "matches your Scripting specialty",
    origin: "model",
    anchor: {
      kind: "original",
      teamId: "team-mys",
      projectId: null,
      projectName: null,
    },
    ...overrides,
  };
}

describe("clampEstimate", () => {
  it("keeps values inside DevHub's 1-5 complexity scale", () => {
    // A raw Linear point value (8) leaking through would surface as a
    // confusing form error at submit time.
    assert.equal(clampEstimate(8), 5);
    assert.equal(clampEstimate(0), 1);
    assert.equal(clampEstimate(3), 3);
  });

  it("falls back to something submittable when there is no number", () => {
    assert.equal(clampEstimate(null), 2);
    assert.equal(clampEstimate(Number.NaN), 2);
  });
});

describe("ideaDescriptionMarkdown", () => {
  it("puts the scope first and the criteria under a heading", () => {
    const body = ideaDescriptionMarkdown(idea());
    assert.match(body, /^Riders tap in before boarding\./);
    assert.match(body, /## Acceptance criteria/);
    assert.match(body, /- Gate blocks entry without a ticket\./);
  });

  it("omits the heading when there are no criteria", () => {
    const body = ideaDescriptionMarkdown(idea({ acceptanceCriteria: [] }));
    assert.doesNotMatch(body, /Acceptance criteria/);
  });
});

describe("ideaClipboardText", () => {
  it("carries no PPT label — that's the whole point of the bonus route", () => {
    // Anything DevHub labels PPT is permanently bonus-ineligible, so the text
    // a human pastes into Linear must not mention or imply it.
    const text = ideaClipboardText(idea());
    assert.doesNotMatch(text, /PPT/);
    assert.match(text, /Add a ticket gate/);
  });
});

describe("pptRequestPrefillFromIdea", () => {
  it("never prefills a due date", () => {
    // The modal requires one to advance and the server only checks that it
    // parses, not that it is in the future — a human choosing it is the only
    // thing preventing a past-dated request.
    const prefill = pptRequestPrefillFromIdea(idea());
    assert.ok(!("dueDate" in prefill));
  });

  it("routes an original idea to the 'new issue' mode", () => {
    const prefill = pptRequestPrefillFromIdea(idea());
    assert.equal(prefill.mode, "new");
    assert.equal(prefill.existingIssueId, null);
    assert.equal(prefill.newTitle, "Add a ticket gate to the transit entrance");
  });

  it("routes an anchored idea to the existing issue", () => {
    const prefill = pptRequestPrefillFromIdea(
      idea({
        anchor: {
          kind: "existing",
          linearIssueId: "issue-1",
          identifier: "MYS-9",
          url: null,
          hasPptLabel: false,
          hasExistingRequest: false,
          hasLiveBonusCandidate: false,
        },
      }),
    );
    assert.equal(prefill.mode, "existing");
    assert.equal(prefill.existingIssueId, "issue-1");
  });

  it("hands the estimate over as a string, clamped", () => {
    const prefill = pptRequestPrefillFromIdea(idea({ estimate: 8 }));
    assert.equal(prefill.estimate, "5");
  });
});

describe("ideaBlockedReason", () => {
  const existing = (extra: Record<string, boolean>) =>
    idea({
      anchor: {
        kind: "existing",
        linearIssueId: "issue-1",
        identifier: "MYS-9",
        url: null,
        hasPptLabel: false,
        hasExistingRequest: false,
        hasLiveBonusCandidate: false,
        ...extra,
      } as TaskIdea["anchor"],
    });

  it("blocks an issue that is already a PPT", () => {
    assert.match(
      ideaBlockedReason(existing({ hasPptLabel: true })) ?? "",
      /already a ppt/i,
    );
  });

  it("blocks an issue a request already covers", () => {
    assert.match(
      ideaBlockedReason(existing({ hasExistingRequest: true })) ?? "",
      /already covers/i,
    );
  });

  it("does NOT block on a live bonus candidate — that's a warning", () => {
    // Converting is usually the better deal for the developer; the admin gate
    // at approval is what refuses the cases that actually lose money.
    assert.equal(
      ideaBlockedReason(existing({ hasLiveBonusCandidate: true })),
      null,
    );
  });

  it("never blocks an original idea", () => {
    assert.equal(ideaBlockedReason(idea()), null);
  });
});

describe("rankedTaskToIdea", () => {
  it("keeps the ranker's reason verbatim", () => {
    const converted = rankedTaskToIdea({
      task: {
        id: "issue-1",
        identifier: "MYS-1",
        title: "Fix the spawn timer",
        description: null,
        estimate: 2,
        labelNames: ["PPT"],
      },
      score: 6,
      because: "matches your Scripting specialty · a small one to start with",
      matchedSpecialties: ["SCRIPTING"],
    });
    assert.equal(
      converted.because,
      "matches your Scripting specialty · a small one to start with",
    );
    assert.equal(converted.origin, "ranker");
    assert.equal(converted.anchor.kind, "existing");
  });
});
