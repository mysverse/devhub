import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVATION_KINDS,
  emptyProgress,
  summariseFunnel,
} from "@/lib/activation-events";

describe("activation funnel", () => {
  it("is ordered as the funnel actually runs", () => {
    // The order is the report. A kind inserted in the wrong place would make
    // the summary read as a nonsensical drop-off curve.
    assert.deepEqual(ACTIVATION_KINDS, [
      "ppt_requested",
      "task_claimed",
      "proof_posted",
      "proof_rejected",
      "payout_paid",
    ]);
  });

  it("counts developers, not events", () => {
    // One developer claiming five tasks is one activated developer. Counting
    // rows would make a single busy person look like a healthy funnel.
    const summary = summariseFunnel([
      { userId: "a", kind: "task_claimed" },
      { userId: "a", kind: "task_claimed" },
      { userId: "a", kind: "task_claimed" },
      { userId: "b", kind: "task_claimed" },
    ]);
    const claimed = summary.find((row) => row.kind === "task_claimed");
    assert.equal(claimed?.developers, 2);
  });

  it("reports every stage, including the ones nobody reached", () => {
    const summary = summariseFunnel([{ userId: "a", kind: "task_claimed" }]);
    assert.equal(summary.length, ACTIVATION_KINDS.length);
    assert.equal(
      summary.find((row) => row.kind === "payout_paid")?.developers,
      0,
    );
  });

  it("ignores kinds it doesn't know about", () => {
    const summary = summariseFunnel([
      { userId: "a", kind: "something_else" },
      { userId: "a", kind: "task_claimed" },
    ]);
    assert.deepEqual(
      summary.map((row) => row.kind),
      [...ACTIVATION_KINDS],
    );
  });

  it("starts everyone at zero progress", () => {
    const progress = emptyProgress();
    assert.equal(Object.keys(progress).length, ACTIVATION_KINDS.length);
    assert.ok(Object.values(progress).every((crossed) => crossed === false));
  });
});
