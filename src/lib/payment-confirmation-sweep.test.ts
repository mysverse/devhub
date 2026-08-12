import assert from "node:assert/strict";
import { test } from "node:test";
import { STALE_PENDING_MS } from "./delivery-staleness";
import {
  CONFIRMATION_EMAIL_CHANNEL,
  type ConfirmationNotification,
  paymentConfirmationDedupeKey,
  selectTransactionsNeedingConfirmation,
} from "./payment-confirmation-sweep";

const NOW = Date.UTC(2026, 7, 12, 7, 0, 0);

function notification(
  transactionId: string,
  delivery?: Partial<{
    status: string;
    ageMs: number;
    skippedReason: string | null;
    channel: string;
  }>,
): ConfirmationNotification {
  return {
    dedupeKey: paymentConfirmationDedupeKey(transactionId),
    deliveries: delivery
      ? [
          {
            channel: delivery.channel ?? CONFIRMATION_EMAIL_CHANNEL,
            status: delivery.status ?? "SENT",
            updatedAt: new Date(NOW - (delivery.ageMs ?? 0)),
            skippedReason: delivery.skippedReason ?? null,
          },
        ]
      : [],
  };
}

test("a transaction with no notification at all needs a confirmation", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(["tx1", "tx2"], [], NOW),
    ["tx1", "tx2"],
  );
});

test("a notification with no email delivery needs a confirmation", () => {
  // The notification row was created and then the send died before it could
  // reserve a delivery — the 2026-08-12 failure mode.
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(["tx1"], [notification("tx1")], NOW),
    ["tx1"],
  );
});

test("a sent confirmation is left alone", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [notification("tx1", { status: "SENT" })],
      NOW,
    ),
    [],
  );
});

test("a failed delivery is re-sent", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [notification("tx1", { status: "FAILED" })],
      NOW,
    ),
    ["tx1"],
  );
});

test("a pending delivery is left alone until it goes stale", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [notification("tx1", { status: "PENDING", ageMs: 60_000 })],
      NOW,
    ),
    [],
  );
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [
        notification("tx1", {
          status: "PENDING",
          ageMs: STALE_PENDING_MS + 1,
        }),
      ],
      NOW,
    ),
    ["tx1"],
  );
});

test("a developer with no email on file is not chased every hour", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [
        notification("tx1", {
          status: "SKIPPED",
          skippedReason: "no-email-on-file",
        }),
      ],
      NOW,
    ),
    [],
  );
});

test("a rate-limited send is retried", () => {
  // Unlike a missing address, this one clears on its own — dropping it would
  // silently lose the confirmation for anyone paid during a burst.
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [
        notification("tx1", {
          status: "SKIPPED",
          skippedReason: "rate_limited",
        }),
      ],
      NOW,
    ),
    ["tx1"],
  );
});

test("an in-app delivery does not stand in for the email one", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [notification("tx1", { channel: "in_app", status: "SENT" })],
      NOW,
    ),
    ["tx1"],
  );
});

test("another transaction's notification is not credited to this one", () => {
  assert.deepEqual(
    selectTransactionsNeedingConfirmation(
      ["tx1"],
      [notification("tx2", { status: "SENT" })],
      NOW,
    ),
    ["tx1"],
  );
});
