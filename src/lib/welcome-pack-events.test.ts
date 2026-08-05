import assert from "node:assert/strict";
import { test } from "node:test";
import { diffForEvent, redactOrderEventMetadata } from "./welcome-pack-events";

test("diffForEvent keeps only changed keys", () => {
  const before = { city: "Ipoh", postalCode: "30000" };
  const after = { city: "Kuala Lumpur", postalCode: "30000" };
  assert.deepEqual(diffForEvent(before, after, ["city", "postalCode"]), {
    before: { city: "Ipoh" },
    after: { city: "Kuala Lumpur" },
  });
});

test("redaction keeps the changed-key set but drops located values", () => {
  const metadata = {
    before: { addressLine1: "88 Jalan Meranti", city: "Ipoh" },
    after: { addressLine1: "12 Jalan Cempaka", city: "Kuala Lumpur" },
  };

  assert.deepEqual(redactOrderEventMetadata(metadata), {
    before: { addressLine1: "[redacted]", city: "[redacted]" },
    after: { addressLine1: "[redacted]", city: "[redacted]" },
    _redacted: true,
  });
});

test("non-address keys survive redaction", () => {
  const metadata = {
    before: { region: "DOMESTIC", phone: "+60171234567" },
    after: { region: "INTERNATIONAL", phone: "+60177654321" },
  };

  assert.deepEqual(redactOrderEventMetadata(metadata), {
    before: { region: "DOMESTIC", phone: "[redacted]" },
    after: { region: "INTERNATIONAL", phone: "[redacted]" },
    _redacted: true,
  });
});

test("a null value stays null so 'was unset' is still legible", () => {
  const metadata = {
    before: { addressLine2: null },
    after: { addressLine2: "Unit 3" },
  };
  assert.deepEqual(redactOrderEventMetadata(metadata), {
    before: { addressLine2: null },
    after: { addressLine2: "[redacted]" },
    _redacted: true,
  });
});

test("metadata without a before/after diff is passed through untouched", () => {
  assert.deepEqual(redactOrderEventMetadata({ reason: "duplicate" }), {
    reason: "duplicate",
  });
  assert.equal(redactOrderEventMetadata(null), null);
  assert.deepEqual(redactOrderEventMetadata([1, 2]), [1, 2]);
});

test("redaction is idempotent", () => {
  const metadata = { before: { city: "Ipoh" }, after: { city: "KL" } };
  const once = redactOrderEventMetadata(metadata);
  assert.deepEqual(redactOrderEventMetadata(once), once);
});
