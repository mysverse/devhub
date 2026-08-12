import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSweepableNotification,
  NOTIFICATION_RETRY_GRACE_MS,
  NOTIFICATION_RETRY_MAX_AGE_MS,
  type RetryCandidate,
  selectDeliveriesToRetry,
} from "./notification-retry";

const NOW = Date.UTC(2026, 7, 12, 7, 0, 0);
const OLD_ENOUGH = NOTIFICATION_RETRY_GRACE_MS + 1000;

function candidate(overrides: Partial<RetryCandidate> = {}): RetryCandidate {
  return {
    id: "d1",
    notificationId: "n1",
    status: "FAILED",
    updatedAt: new Date(NOW - OLD_ENOUGH),
    notification: {
      domain: "kyc",
      type: "APPROVED",
      createdAt: new Date(NOW - OLD_ENOUGH),
    },
    ...overrides,
  };
}

test("a failed sweepable delivery past the grace period is retried", () => {
  assert.equal(selectDeliveriesToRetry([candidate()], NOW).length, 1);
});

test("only FAILED rows are touched", () => {
  for (const status of ["SENT", "PENDING", "SKIPPED"]) {
    assert.deepEqual(
      selectDeliveriesToRetry([candidate({ status })], NOW),
      [],
      `${status} must be left alone`,
    );
  }
});

test("a just-failed delivery waits out the grace period", () => {
  // The emit path that failed may still be reporting it to a user who is
  // about to press resend themselves.
  const fresh = candidate({ updatedAt: new Date(NOW - 1000) });
  assert.deepEqual(selectDeliveriesToRetry([fresh], NOW), []);
});

test("a stale notification is abandoned rather than chased forever", () => {
  const old = candidate({
    notification: {
      domain: "kyc",
      type: "APPROVED",
      createdAt: new Date(NOW - NOTIFICATION_RETRY_MAX_AGE_MS - 1000),
    },
  });
  assert.deepEqual(selectDeliveriesToRetry([old], NOW), []);
});

test("payment:PROCESSED is never swept — its own reconciler owns it", () => {
  // The generic path cannot rebuild the PDF slip, and re-sending without it
  // would mark the delivery SENT and hide the loss permanently.
  const payment = candidate({
    notification: {
      domain: "payment",
      type: "PROCESSED",
      createdAt: new Date(NOW - OLD_ENOUGH),
    },
  });
  assert.deepEqual(selectDeliveriesToRetry([payment], NOW), []);
  assert.equal(isSweepableNotification("payment", "PROCESSED"), false);
});

test("an unknown notification type is not swept", () => {
  // No catalog entry means nobody has declared whether the email can be
  // rebuilt from the Notification row. Guessing yes is how a slip gets lost.
  const unknown = candidate({
    notification: {
      domain: "something",
      type: "NEW",
      createdAt: new Date(NOW - OLD_ENOUGH),
    },
  });
  assert.deepEqual(selectDeliveriesToRetry([unknown], NOW), []);
  assert.equal(isSweepableNotification("something", "NEW"), false);
});

test("ordinary notification types are sweepable", () => {
  assert.equal(isSweepableNotification("kyc", "APPROVED"), true);
  assert.equal(isSweepableNotification("payment", "REJECTED"), true);
});

test("a mixed batch keeps only what is eligible", () => {
  const selected = selectDeliveriesToRetry(
    [
      candidate({ id: "keep" }),
      candidate({ id: "sent", status: "SENT" }),
      candidate({ id: "fresh", updatedAt: new Date(NOW) }),
      candidate({
        id: "owned",
        notification: {
          domain: "payment",
          type: "PROCESSED",
          createdAt: new Date(NOW - OLD_ENOUGH),
        },
      }),
    ],
    NOW,
  );

  assert.deepEqual(
    selected.map((s) => s.id),
    ["keep"],
  );
});
