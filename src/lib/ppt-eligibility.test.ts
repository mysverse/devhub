import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldEvaluatePptWebhookHint } from "./ppt-eligibility-gate";

test("started untracked PPT issue updates do not enter payout eligibility", () => {
  assert.equal(
    shouldEvaluatePptWebhookHint({
      stateType: "started",
      previousCompletionEpisode: 0,
      previousTransactionId: null,
    }),
    false,
  );
});

test("completed issue updates enter payout eligibility", () => {
  assert.equal(shouldEvaluatePptWebhookHint({ stateType: "completed" }), true);
});

test("previously completed tracked issue still evaluates when reopened", () => {
  assert.equal(
    shouldEvaluatePptWebhookHint({
      stateType: "started",
      previousCompletionEpisode: 1,
    }),
    true,
  );
});

test("tracked transaction still evaluates when not completed", () => {
  assert.equal(
    shouldEvaluatePptWebhookHint({
      stateType: "started",
      previousTransactionId: "tx_123",
    }),
    true,
  );
});
