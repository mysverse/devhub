/**
 * Guards the one way PptRequestModal's prefill can silently break.
 *
 * The modal seeds its state twice: once in the useState initializers, and
 * again in resetForm() when the modal closes. While the form always started
 * empty those were two harmless copies of the same literals. With a prefill
 * they must agree, or closing and reopening quietly discards the idea the
 * developer picked — with no error and nothing in a log.
 *
 * Reads the real file, like action-guard-inventory.test.ts, because the
 * invariant is about the source rather than about a value.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/dashboard/ppts/PptRequestModal.tsx"),
  "utf8",
);

function initialStateKeys(): string[] {
  const body = /function initialState\([\s\S]*?\n}/.exec(SOURCE)?.[0];
  assert.ok(body, "initialState() not found — did it get renamed?");
  return [...body.matchAll(/^\s{4}(\w+):/gm)].map((match) => match[1]);
}

function resetFormBody(): string {
  const body = /function resetForm\(\)[\s\S]*?\n {2}}/.exec(SOURCE)?.[0];
  assert.ok(body, "resetForm() not found — did it get renamed?");
  return body;
}

test("initialState actually returns something", () => {
  assert.ok(
    initialStateKeys().length >= 4,
    "expected initialState to seed mode, title, description and estimate",
  );
});

test("resetForm re-seeds from initialState rather than literals", () => {
  const body = resetFormBody();
  assert.match(
    body,
    /initialState\(prefill\)/,
    "resetForm must call initialState(prefill); hardcoded literals would drop the prefill on close",
  );
});

test("every prefillable field is seeded in both places", () => {
  const keys = initialStateKeys();
  const reset = resetFormBody();
  const missingFromInitializers = keys.filter(
    (key) => !SOURCE.includes(`initial.${key}`),
  );
  const missingFromReset = keys.filter((key) => !reset.includes(`next.${key}`));

  assert.deepEqual(
    missingFromInitializers,
    [],
    `initialState returns these but no useState reads them: ${missingFromInitializers.join(", ")}`,
  );
  assert.deepEqual(
    missingFromReset,
    [],
    `initialState returns these but resetForm ignores them: ${missingFromReset.join(", ")}`,
  );
});

test("the due date is never prefilled", () => {
  // The server checks only that a due date parses, not that it is in the
  // future, so a human choosing it is the last guard against a past-dated
  // request reaching an admin.
  assert.ok(
    !initialStateKeys().includes("dueDate"),
    "dueDate must not be prefillable",
  );
  assert.match(resetFormBody(), /setDueDate\(null\)/);
});
