import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAYOUT_STALE_MS,
  type ReconcilablePayout,
  selectUnreconciledPayouts,
} from "./payout-reconcile";

const NOW = Date.UTC(2026, 7, 12, 7, 0, 0);
const STALE = new Date(NOW - PAYOUT_STALE_MS - 1000);
const FRESH = new Date(NOW - 60_000);

function payout(
  overrides: Partial<ReconcilablePayout> = {},
): ReconcilablePayout {
  return {
    id: "p1",
    transactionId: "t1",
    provider: "BILLPLZ",
    status: "PROCESSING",
    providerPayoutId: "billplz-123",
    updatedAt: STALE,
    ...overrides,
  };
}

test("a polled payout with a provider id is left to its poll cron", () => {
  assert.deepEqual(selectUnreconciledPayouts([payout()], NOW), []);
});

/**
 * Inverted when Xendit was removed. This previously asserted that a XENDIT row
 * was left alone because "its cron owns it" — true only while xendit-poll
 * existed. With the cron gone, a row like this would otherwise sit in
 * PROCESSING forever, unpolled and unflagged, while also blocking manual
 * payment of the transaction via classifyPayoutRoute's provider_processing
 * branch. It must be loud.
 */
test("a payout whose provider has no poll cron is flagged, not trusted", () => {
  const [flag] = selectUnreconciledPayouts(
    [payout({ provider: "XENDIT" })],
    NOW,
  );
  assert.equal(flag?.reason, "no-poll-cron");
});

test("a payout with no provider id is invisible to the polls and is flagged", () => {
  // billplz-poll filters providerPayoutId: { not: null }, so this row is
  // never looked at again by anything.
  const [flag] = selectUnreconciledPayouts(
    [payout({ providerPayoutId: null })],
    NOW,
  );
  assert.equal(flag.reason, "no-provider-id");
});

test("a Roblox payout is flagged because nothing polls FinSys", () => {
  const [flag] = selectUnreconciledPayouts(
    [payout({ provider: "ROBLOX", providerPayoutId: "finsys-1" })],
    NOW,
  );
  assert.equal(flag.reason, "no-poll-cron");
});

test("a decided payout is never flagged", () => {
  for (const status of ["COMPLETED", "FAILED"]) {
    assert.deepEqual(
      selectUnreconciledPayouts(
        [payout({ status, providerPayoutId: null })],
        NOW,
      ),
      [],
      `${status} is decided`,
    );
  }
});

test("a recent payout is given time before anyone is alarmed", () => {
  assert.deepEqual(
    selectUnreconciledPayouts(
      [payout({ providerPayoutId: null, updatedAt: FRESH })],
      NOW,
    ),
    [],
  );
});

test("a PENDING payout counts as non-terminal", () => {
  const [flag] = selectUnreconciledPayouts(
    [payout({ status: "PENDING", providerPayoutId: null })],
    NOW,
  );
  assert.equal(flag.reason, "no-provider-id");
});

test("a mixed set flags only what nothing else will resolve", () => {
  const flagged = selectUnreconciledPayouts(
    [
      payout({ id: "polled" }),
      payout({ id: "orphan", providerPayoutId: null }),
      payout({ id: "roblox", provider: "ROBLOX" }),
      payout({ id: "done", status: "COMPLETED", providerPayoutId: null }),
      payout({ id: "fresh", providerPayoutId: null, updatedAt: FRESH }),
    ],
    NOW,
  );

  assert.deepEqual(
    flagged.map((f) => f.payout.id),
    ["orphan", "roblox"],
  );
});
