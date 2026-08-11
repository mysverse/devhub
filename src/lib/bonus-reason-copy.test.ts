import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explainBonusIneligibility } from "./bonus-reason-copy";

describe("explainBonusIneligibility", () => {
  it("names the consequence and the fix for a missing estimate", () => {
    const copy = explainBonusIneligibility("Missing complexity estimate");
    assert.match(copy.meaning, /estimate/);
    assert.ok(copy.nextStep);
    assert.equal(copy.owner, "developer");
  });

  it("reads the label out of a configurable exclusion", () => {
    const copy = explainBonusIneligibility("Excluded label: Redistributable");
    assert.match(copy.meaning, /"Redistributable"/);
    assert.equal(copy.owner, "admin");
  });

  it("survives an exclusion phrase with no label after it", () => {
    const copy = explainBonusIneligibility("Excluded label:");
    assert.match(copy.meaning, /label/);
  });

  it("offers no next step where nothing the developer does would help", () => {
    for (const reason of ["Already paid via PPT", "Canceled issue"]) {
      assert.equal(explainBonusIneligibility(reason).nextStep, null, reason);
    }
  });

  it("explains a PPT collision without implying money was lost", () => {
    const copy = explainBonusIneligibility("PPT task");
    assert.match(copy.meaning, /PPT payout/);
    assert.ok(copy.nextStep);
  });

  it("falls back rather than rendering an empty row", () => {
    for (const reason of [null, undefined, "", "   ", "something new"]) {
      const copy = explainBonusIneligibility(reason);
      assert.ok(copy.meaning.length > 0, String(reason));
    }
  });
});
