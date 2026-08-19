import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canConfirmManualPayment,
  canInitiateProviderPayout,
  classifyPayoutRoute,
} from "./payout-routing";

test("a transaction with no payout can be paid", () => {
  assert.equal(canInitiateProviderPayout(null).allowed, true);
});

test("an in-flight or completed payout is never replaced", () => {
  for (const status of ["PENDING", "PROCESSING", "COMPLETED"]) {
    assert.equal(
      canInitiateProviderPayout({ status, providerPayoutId: null }).allowed,
      false,
      `${status} must not be replaced`,
    );
  }
});

test("a failed attempt that never reached the provider can be replaced", () => {
  const decision = canInitiateProviderPayout({
    status: "FAILED",
    providerPayoutId: null,
  });
  assert.equal(decision.allowed, true);
});

test("a failed payout that carries a provider id is NOT replaced", () => {
  // The id is the only evidence a provider was ever asked, it is @unique, and
  // both poll crons select on it. Deleting the row turns "we do not know
  // whether this was sent" into "nothing was ever sent" — and the retry sends
  // real money a second time.
  const decision = canInitiateProviderPayout({
    status: "FAILED",
    providerPayoutId: "billplz-abc",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /check the provider/i);
});

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

/**
 * A DuitNow proxy ID is always the manual path. There is no provider that
 * disburses to a proxy — Billplz takes bank_code + account number, and
 * Xendit's Malaysian payouts are bank accounts too.
 */
test("a DuitNow proxy ID routes to manual confirmation", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "DUITNOW",
    duitNowId: "+60123456789",
  });
  assert.equal(route.status, "manual_eligible");
  assert.equal(canConfirmManualPayment(route), true);
});

/**
 * Bank details win over a proxy when a developer has both. PayoutCard used to
 * render the opposite precedence, so an admin was told to pay a proxy while
 * Billplz was actually paid the bank account.
 */
test("a bank triple takes precedence over a proxy ID on the same profile", () => {
  const route = classifyPayoutRoute({
    transactionStatus: "PENDING",
    currency: "MYR",
    paymentMethod: "DUITNOW",
    duitNowId: "+60123456789",
    bankName: "MBBEMYKL",
    bankAccountNumber: "512345678901",
    bankAccountName: "Nurul Aina binti Ahmad",
  });
  assert.equal(route.status, "provider_eligible");
  assert.equal(route.provider, "BILLPLZ");
});

/**
 * duitNowIdStatus is display-only and must never reach this function. The
 * migration leaves every pre-existing proxy user UNCONFIRMED by construction,
 * so gating a payout on it would make every in-flight proxy payout
 * unpayable on the day it ships. If someone adds it to PayoutRouteInput, this
 * fails.
 */
test("the DuitNow lookup status cannot influence routing", () => {
  const base = {
    transactionStatus: "PENDING" as const,
    currency: "MYR",
    paymentMethod: "DUITNOW",
    duitNowId: "+60123456789",
  };
  const baseline = classifyPayoutRoute(base);
  for (const duitNowIdStatus of [
    "UNCONFIRMED",
    "CONFIRMED",
    "RESOLVED",
    "UNREACHABLE",
  ]) {
    assert.deepEqual(
      classifyPayoutRoute({ ...base, duitNowIdStatus } as typeof base),
      baseline,
      duitNowIdStatus,
    );
  }
});
