import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTIFICATION_CATALOG } from "./catalog";
import { TYPE_OVERRIDES } from "./copy";

test("every presentation override has a catalog entry (no drift)", () => {
  const catalogKeys = new Set(
    NOTIFICATION_CATALOG.map((entry) => `${entry.domain}:${entry.type}`),
  );
  const missing = Object.keys(TYPE_OVERRIDES).filter(
    (key) => !catalogKeys.has(key),
  );
  assert.deepEqual(
    missing,
    [],
    `TYPE_OVERRIDES keys missing from the notification catalog: ${missing.join(", ")}`,
  );
});

test("catalog entries are unique per domain:type", () => {
  const seen = new Set<string>();
  for (const entry of NOTIFICATION_CATALOG) {
    const key = `${entry.domain}:${entry.type}`;
    assert.ok(!seen.has(key), `Duplicate catalog entry: ${key}`);
    seen.add(key);
  }
});

test("email-only entries keep in_app off deliberately", () => {
  const digest = NOTIFICATION_CATALOG.find(
    (entry) => entry.type === "OPEN_TASKS_DIGEST",
  );
  assert.ok(digest);
  assert.equal(digest.defaults.in_app, false);
  assert.equal(digest.defaults.email, true);
});
