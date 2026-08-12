import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeliverySettled, STALE_PENDING_MS } from "./delivery-staleness";

const NOW = Date.UTC(2026, 7, 12, 7, 0, 0);

function delivery(status: string, ageMs: number) {
  return { status, updatedAt: new Date(NOW - ageMs) };
}

test("a sent delivery is never re-attempted", () => {
  assert.equal(isDeliverySettled(delivery("SENT", 0), NOW), true);
  assert.equal(
    isDeliverySettled(delivery("SENT", 10 * STALE_PENDING_MS), NOW),
    true,
  );
});

test("a recent pending delivery belongs to an attempt still in flight", () => {
  assert.equal(isDeliverySettled(delivery("PENDING", 1000), NOW), true);
});

test("an abandoned pending delivery is retryable", () => {
  // The invocation that reserved this row died mid-send — a transient
  // Accelerate failure is exactly how. Treating it as in-flight forever is
  // what made a paid transaction's confirmation unrecoverable.
  assert.equal(
    isDeliverySettled(delivery("PENDING", STALE_PENDING_MS + 1), NOW),
    false,
  );
});

test("failed and skipped deliveries are retryable", () => {
  assert.equal(isDeliverySettled(delivery("FAILED", 0), NOW), false);
  assert.equal(isDeliverySettled(delivery("SKIPPED", 0), NOW), false);
});
