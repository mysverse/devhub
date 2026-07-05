import assert from "node:assert/strict";
import { test } from "node:test";
import { canConfirmManualPayment, classifyPayoutRoute } from "./payout-routing";

test("provider processing payouts cannot be manually confirmed", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "DUITNOW",
    payout: { status: "PROCESSING", provider: "BILLPLZ" },
  });

  assert.equal(route.status, "provider_processing");
  assert.equal(canConfirmManualPayment(route), false);
});

test("Billplz-supported bank payouts are provider-routed", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "DUITNOW",
    bankName: "MBBEMYKL",
    bankAccountNumber: "1234567890",
    bankAccountName: "Alex Developer",
  });

  assert.equal(route.status, "provider_eligible");
  assert.equal(route.provider, "BILLPLZ");
  assert.equal(canConfirmManualPayment(route), false);
});

test("manual-only payout methods can be manually confirmed", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "PAYPAL",
    paypalEmail: "alex@example.com",
  });

  assert.equal(route.status, "manual_eligible");
  assert.equal(canConfirmManualPayment(route), true);
});

test("missing manual details cannot be manually confirmed", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "PAYPAL",
  });

  assert.equal(route.status, "missing_details");
  assert.equal(canConfirmManualPayment(route), false);
});
