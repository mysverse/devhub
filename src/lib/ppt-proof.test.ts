import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROOF_MIN_CHARS } from "@/lib/payout-policy";
import {
  checkProofBody,
  isDevHubGuidanceComment,
  isMeaningfulProofBody,
  isProofFollowUpQuestion,
  PROOF_QUESTION_MIN_CHARS,
  proofContent,
  summarizeProofEvidence,
} from "@/lib/ppt-proof";
import {
  describePptNextStep,
  formatReason,
  getActionForReason,
} from "@/lib/ppt-reason-copy";

const GOOD_PROOF =
  "#ppt-proof Rebuilt the lobby spawn logic and verified it in Studio: https://example.com/clip";

describe("proofContent", () => {
  it("strips the proof marker before measuring", () => {
    assert.equal(proofContent("#ppt-proof   hello  "), "hello");
  });

  it("strips the marker case-insensitively and anywhere in the body", () => {
    assert.equal(proofContent("done #PPT-Proof here"), "done  here");
  });
});

describe("checkProofBody", () => {
  it("accepts proof with enough substance and a checkable reference", () => {
    assert.equal(checkProofBody(GOOD_PROOF), null);
    assert.equal(isMeaningfulProofBody(GOOD_PROOF), true);
  });

  it("rejects proof shorter than the shared minimum", () => {
    const rejection = checkProofBody("#ppt-proof done, tested it");
    assert.equal(rejection?.reason, "too-short");
    assert.match(rejection?.message ?? "", new RegExp(`${PROOF_MIN_CHARS}`));
  });

  it("does not count the proof marker toward the minimum", () => {
    // 39 characters of content: long enough only if the marker is counted.
    const content = "a".repeat(PROOF_MIN_CHARS - 1);
    assert.equal(checkProofBody(`#ppt-proof ${content}`)?.reason, "too-short");
  });

  it("rejects long prose with nothing checkable in it", () => {
    const rejection = checkProofBody(
      "I finished the whole thing exactly as we discussed on the call yesterday.",
    );
    assert.equal(rejection?.reason, "no-evidence");
  });

  it("names which half of the rule failed", () => {
    const short = checkProofBody("too short");
    const vague = checkProofBody(
      "I finished the whole thing exactly as we discussed on the call yesterday.",
    );
    assert.notEqual(short?.message, vague?.message);
  });

  // The regression this module exists for: proof between the old button gate
  // (20 chars) and the old evaluator gate (40 chars) posted successfully to
  // Linear and then silently failed payout.
  it("treats the button gate and the evaluator gate as the same rule", () => {
    const between = `#ppt-proof ${"a".repeat(25)} https://example.com`;
    assert.equal(
      checkProofBody(between) === null,
      isMeaningfulProofBody(between),
    );
  });
});

describe("evidence must be a thing, not a word about a thing", () => {
  const LONG = "Rebuilt the toll plaza lighting rig and checked every lamp. ";

  it("rejects a bare claim of having evidence", () => {
    // These all passed before: the rule accepted the *words* "screenshot",
    // "tested", "verified" and "implemented" as if they were the evidence.
    for (const claim of [
      "I took a screenshot of it.",
      "Tested it thoroughly.",
      "Verified in Studio.",
      "Implemented and working.",
    ]) {
      assert.equal(
        checkProofBody(LONG + claim)?.reason,
        "no-evidence",
        `expected "${claim}" to be rejected`,
      );
    }
  });

  it("rejects prose that merely contains 'pr' inside another word", () => {
    // The old pattern had an unanchored, case-insensitive `pr` alternative, so
    // "approved", "sprint", "improve" and "press" all counted as evidence.
    for (const word of ["approved", "sprint", "improved", "pressed"]) {
      assert.equal(
        checkProofBody(`${LONG}The change was ${word} today.`)?.reason,
        "no-evidence",
        `expected "${word}" not to count as evidence`,
      );
    }
  });

  it("accepts a link", () => {
    assert.equal(checkProofBody(`${LONG}https://example.com/clip`), null);
  });

  it("accepts an embedded image, which is what an attachment posts as", () => {
    assert.equal(
      checkProofBody(`${LONG}![shot](https://uploads.linear.app/a.png)`),
      null,
    );
  });

  it("accepts a commit SHA but not an all-letter lookalike word", () => {
    assert.equal(checkProofBody(`${LONG}Commit 4f9a2b1.`), null);
    // "defaced" is seven letters drawn entirely from a-f; requiring a digit is
    // what stops it reading as a SHA.
    assert.equal(
      checkProofBody(`${LONG}Nothing was defaced.`)?.reason,
      "no-evidence",
    );
  });

  it("accepts an issue reference but not prose that looks like one", () => {
    assert.equal(checkProofBody(`${LONG}Closes MYS-201.`), null);
    assert.equal(checkProofBody(`${LONG}See #142.`), null);
    // Case-sensitivity is what keeps "step-1" and "phase-2" out.
    for (const phrase of ["step-1", "phase-2", "part-3"]) {
      assert.equal(
        checkProofBody(`${LONG}Finished ${phrase} of the work.`)?.reason,
        "no-evidence",
        `expected "${phrase}" not to count as a reference`,
      );
    }
  });
});

describe("attachments as evidence", () => {
  const PROSE =
    "Rebuilt the toll plaza lighting rig; every lamp now uses the shared emitter.";

  it("lets an attachment satisfy the evidence half of the rule", () => {
    assert.equal(checkProofBody(PROSE)?.reason, "no-evidence");
    assert.equal(checkProofBody(PROSE, { hasAttachments: true }), null);
    assert.equal(isMeaningfulProofBody(PROSE, { hasAttachments: true }), true);
  });

  it("still enforces the length minimum — a bare screenshot is not proof", () => {
    assert.equal(
      checkProofBody("done", { hasAttachments: true })?.reason,
      "too-short",
    );
  });

  it("reaches the same verdict once the markdown is in the body", () => {
    // The composer knows about the upload early; the evaluator re-reads the
    // posted comment later with no context at all. Both must agree.
    const posted = `${PROSE}\n\n![shot](https://uploads.linear.app/a.png)`;
    assert.equal(checkProofBody(PROSE, { hasAttachments: true }), null);
    assert.equal(checkProofBody(posted), null);
  });
});

describe("rejected proof is reported as its own reason", () => {
  it("does not tell a developer to post proof they already posted", () => {
    const missing = formatReason("MISSING_PROOF");
    const rejected = formatReason("PROOF_NOT_QUALIFYING");
    assert.notEqual(missing, rejected);
    // The whole point: the rejected copy has to acknowledge a comment exists.
    assert.match(rejected, /was posted/i);
  });

  it("spells out both halves of the rule in the next step", () => {
    const action = getActionForReason("PROOF_NOT_QUALIFYING");
    assert.match(action, new RegExp(`${PROOF_MIN_CHARS}`));
    // Names something the developer can actually produce, not a vague "add
    // evidence" — and leads with attaching, now that it's possible.
    assert.match(action, /attach/i);
    assert.match(action, /link|commit|reference/i);
  });

  it("keeps the rejected proof waiting on the developer, not an admin", () => {
    assert.equal(
      describePptNextStep("NEEDS_PROOF", "PROOF_NOT_QUALIFYING").owner,
      "developer",
    );
  });
});

describe("isProofFollowUpQuestion", () => {
  it("ignores a bare question mark", () => {
    assert.equal(isProofFollowUpQuestion("?"), false);
    assert.equal(isProofFollowUpQuestion("??"), false);
    assert.equal(isProofFollowUpQuestion("huh?"), false);
  });

  it("still catches a real reviewer question", () => {
    assert.equal(
      isProofFollowUpQuestion("Where is this implemented in the place file?"),
      true,
    );
    assert.equal(
      isProofFollowUpQuestion("Can you provide a screenshot of the fix?"),
      true,
    );
  });

  it("ignores DevHub's own guidance comment", () => {
    assert.equal(
      isProofFollowUpQuestion(
        "DevHub payout check: post proof with screenshots to verify this task.",
      ),
      false,
    );
    assert.equal(
      isDevHubGuidanceComment("devhub payout check ran just now"),
      true,
    );
  });

  it("requires the shared minimum length", () => {
    const short = `${"a".repeat(PROOF_QUESTION_MIN_CHARS - 1)}?`.slice(
      0,
      PROOF_QUESTION_MIN_CHARS - 1,
    );
    assert.equal(isProofFollowUpQuestion(short), false);
  });
});

describe("summarizeProofEvidence", () => {
  it("counts an embedded image once, not as an image and a link", () => {
    const inventory = summarizeProofEvidence(
      "Fixed the gate. ![shot](https://uploads.linear.app/a.png)",
    );
    assert.equal(inventory.images, 1);
    assert.equal(inventory.links, 0);
  });

  it("counts links and images separately when both are present", () => {
    const inventory = summarizeProofEvidence(
      "See https://example.com/a and https://example.com/b ![x](https://uploads.linear.app/c.png)",
    );
    assert.equal(inventory.links, 2);
    assert.equal(inventory.images, 1);
  });

  it("names references and de-duplicates them", () => {
    const inventory = summarizeProofEvidence(
      "Follows MYS-201, blocked by MYS-201, split from MYS-88.",
    );
    assert.deepEqual(inventory.references, ["MYS-201", "MYS-88"]);
  });

  it("counts what the gate counts, with the marker stripped", () => {
    const body = "#ppt-proof Fixed the spawn timer.";
    assert.equal(
      summarizeProofEvidence(body).contentChars,
      proofContent(body).length,
    );
  });

  it("reports nothing rather than guessing on empty proof", () => {
    assert.deepEqual(summarizeProofEvidence(""), {
      links: 0,
      images: 0,
      references: [],
      contentChars: 0,
    });
  });

  it("agrees with the gate about whether there is any evidence at all", () => {
    // The inventory reports on the rule; it must never claim evidence the rule
    // does not see, or an admin reads "1 link" next to a rejected payout.
    for (const body of [
      "Fixed it, see https://example.com/x, plenty long enough to pass.",
      "Fixed it in MYS-201, and that is plenty long enough to pass the gate.",
      "Nothing here at all but words, though it is long enough to pass length.",
    ]) {
      const inventory = summarizeProofEvidence(body);
      const counted =
        inventory.links + inventory.images + inventory.references.length > 0;
      const gated = checkProofBody(body)?.reason !== "no-evidence";
      assert.equal(counted, gated, body);
    }
  });
});
