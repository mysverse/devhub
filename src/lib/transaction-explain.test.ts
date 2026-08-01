import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explainTransaction,
  type TransactionExplainInput,
} from "./transaction-explain";

function tx(overrides: Record<string, unknown>): TransactionExplainInput {
  return {
    id: "tx1",
    userId: "user1",
    amount: 40,
    currency: "MYR",
    source: "PPT",
    status: "PENDING",
    autoApproved: false,
    rejectionReason: null,
    payout: null,
    pptPayoutState: null,
    ...overrides,
  } as unknown as TransactionExplainInput;
}

test("paid transactions read as paid", () => {
  const result = explainTransaction(tx({ status: "PAID" }));
  assert.equal(result.tone, "positive");
  assert.match(result.headline, /Paid/);
});

test("rejected transactions surface the stored reason", () => {
  const result = explainTransaction(
    tx({ status: "REJECTED", rejectionReason: "Duplicate submission" }),
  );
  assert.equal(result.tone, "critical");
  assert.equal(result.detail, "Duplicate submission");
  assert.equal(result.owner, "admin");
});

test("rejected without a reason still explains itself", () => {
  const result = explainTransaction(tx({ status: "REJECTED" }));
  assert.match(result.detail ?? "", /No reason was recorded/);
});

test("pending auto-approved PPT reads as automatic", () => {
  const result = explainTransaction(tx({ autoApproved: true }));
  assert.equal(result.owner, "automatic");
  assert.match(result.headline, /automatic payout/i);
});

test("pending over-limit PPT names the weekly limit and Monday reset", () => {
  const result = explainTransaction(tx({ autoApproved: false }));
  assert.equal(result.owner, "admin");
  assert.match(result.headline, /Awaiting admin review/);
  assert.match(result.detail ?? "", /RM100\.00/);
  assert.match(result.detail ?? "", /Monday/);
});

test("provider processing wins over the credit-limit story", () => {
  const result = explainTransaction(
    tx({
      autoApproved: true,
      payout: { status: "PROCESSING", provider: "BILLPLZ" },
    }),
  );
  assert.match(result.headline, /Billplz/);
  assert.equal(result.owner, "automatic");
});

test("failed payout never leaks the raw error message", () => {
  const result = explainTransaction(
    tx({
      payout: {
        status: "FAILED",
        provider: "XENDIT",
        errorMessage: "ECONNRESET upstream 502",
      },
    }),
  );
  assert.equal(result.owner, "admin");
  assert.doesNotMatch(result.headline + (result.detail ?? ""), /ECONNRESET/);
});

test("on-hold uses the PPT state reason", () => {
  const result = explainTransaction(
    tx({
      status: "ON_HOLD",
      pptPayoutState: { status: "ON_HOLD", reason: "REOPENED_BEFORE_PAYOUT" },
    }),
  );
  assert.match(result.headline, /moved out of Done/);
  assert.equal(result.tone, "warning");
});

test("bonus and incentive sources have their own stories", () => {
  assert.match(
    explainTransaction(tx({ source: "BONUS" })).headline,
    /payout run/,
  );
  assert.match(
    explainTransaction(tx({ source: "INCENTIVE" })).headline,
    /review window/,
  );
});
