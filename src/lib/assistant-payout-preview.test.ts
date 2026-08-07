import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssistantPptPayoutPreview,
  parseAssistantPptPayoutPreview,
} from "./assistant-payout-preview";

describe("assistant PPT payout previews", () => {
  it("uses the same campaign-aware projection as the rest of DevHub", () => {
    const campaign = {
      slug: "sprint-boost",
      name: "Sprint Boost",
      multiplier: 3,
      accentColor: "violet",
      endsAt: "2026-08-11T00:00:00.000Z",
    };
    assert.deepEqual(buildAssistantPptPayoutPreview(3, "MYR", campaign), {
      currency: "MYR",
      baseAmount: 60,
      amount: 180,
      baseLabel: "RM60.00",
      amountLabel: "RM180.00",
      multiplier: 3,
      campaign,
    });
  });

  it("shows the normal payout range when a PPT has no estimate", () => {
    const preview = buildAssistantPptPayoutPreview(null, "ROBUX");
    assert.equal(preview.amount, null);
    assert.equal(preview.amountLabel, "1,200 Robux – 6,000 Robux");
  });

  it("rejects malformed stored or tool-provided previews", () => {
    assert.equal(
      parseAssistantPptPayoutPreview({
        currency: "MYR",
        amount: "RM180",
      }),
      null,
    );
  });
});
