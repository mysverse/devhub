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
} from "@/lib/ppt-proof";

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
