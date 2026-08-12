import assert from "node:assert/strict";
import { test } from "node:test";
import {
  channelsForEntry,
  configurablePreferenceKeys,
  NOTIFICATION_CATALOG,
} from "./catalog";
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

test("every entry declares who may retry its email", () => {
  // Required, not defaulted: a new notification whose email carries an
  // attachment must be forced to say so. Defaulting to "sweep" would let the
  // generic reconciler send a degraded copy and stamp it SENT, which then
  // hides the loss from the reconciler that could have repaired it.
  const missing = NOTIFICATION_CATALOG.filter(
    (entry) => entry.emailRetry !== "sweep" && entry.emailRetry !== "owned",
  ).map((entry) => `${entry.domain}:${entry.type}`);

  assert.deepEqual(missing, []);
});

test("an owned entry has an email channel to own", () => {
  // "owned" means "the generic sweep must not touch this one" — on an entry
  // that never sends email it would be a no-op hiding a mistake.
  const pointless = NOTIFICATION_CATALOG.filter(
    (entry) => entry.emailRetry === "owned" && !entry.defaults.email,
  ).map((entry) => `${entry.domain}:${entry.type}`);

  assert.deepEqual(pointless, []);
});

test("payment:PROCESSED stays owned by its own sweep", () => {
  // Its email carries the PDF slip, which defaultEmail() rebuilds only from
  // the options passed at emit time. If this ever flips to "sweep", the
  // generic reconciler will send payment confirmations with no slip and
  // permanently blind sweepMissingPaymentConfirmations.
  const entry = NOTIFICATION_CATALOG.find(
    (e) => e.domain === "payment" && e.type === "PROCESSED",
  );
  assert.ok(entry, "payment:PROCESSED missing from the catalog");
  assert.equal(entry.emailRetry, "owned");
});

test("catalog entries are unique per domain:type", () => {
  const seen = new Set<string>();
  for (const entry of NOTIFICATION_CATALOG) {
    const key = `${entry.domain}:${entry.type}`;
    assert.ok(!seen.has(key), `Duplicate catalog entry: ${key}`);
    seen.add(key);
  }
});

test("every configurable entry is settable on every channel", () => {
  // The settings UI renders a toggle for each configurable entry; the save
  // action validates against this set. A gap here is a switch that moves and
  // then silently fails to save, which is exactly what shipped before: five
  // hand-written keys against thirteen rendered toggles.
  const keys = configurablePreferenceKeys();
  const missing: string[] = [];
  for (const entry of NOTIFICATION_CATALOG) {
    if (!entry.configurable) continue;
    for (const channel of channelsForEntry(entry)) {
      const key = `${entry.domain}:${entry.type}:${channel}`;
      if (!keys.has(key)) missing.push(key);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Configurable notifications with no settable preference: ${missing.join(", ")}`,
  );
});

test("always-sent entries are not settable", () => {
  const keys = configurablePreferenceKeys();
  const leaked = NOTIFICATION_CATALOG.filter((entry) => !entry.configurable)
    .flatMap((entry) =>
      channelsForEntry(entry).map(
        (channel) => `${entry.domain}:${entry.type}:${channel}`,
      ),
    )
    .filter((key) => keys.has(key));
  assert.deepEqual(
    leaked,
    [],
    `Always-sent notifications must not be mutable: ${leaked.join(", ")}`,
  );
});

test("discord is only settable where the catalog declares it", () => {
  // A toggle for a channel that will never carry the notification is the same
  // dead-switch problem as the old hand-written allowlist, one level down.
  const keys = configurablePreferenceKeys();
  for (const entry of NOTIFICATION_CATALOG) {
    if (!entry.configurable) continue;
    const key = `${entry.domain}:${entry.type}:discord`;
    assert.equal(
      keys.has(key),
      entry.defaults.discord !== undefined,
      `${key} settable=${keys.has(key)} but declared=${entry.defaults.discord !== undefined}`,
    );
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
