/**
 * Runs the "use server" export rules over the REAL repository, not fixtures.
 *
 * This is the test that would have caught getUserEmailAndName() and
 * sendPaymentConfirmation() sitting unguarded in admin actions modules, and
 * the marker constant that stripped ppt-request-actions.ts of every export.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { checkPiiRules } from "./pii-rules";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts"))
      out.push(full);
  }
  return out;
}

function serverModules() {
  return walk(join(ROOT, "src", "app"))
    .map((absolute) => ({
      file: relative(ROOT, absolute).split("\\").join("/"),
      source: readFileSync(absolute, "utf8"),
    }))
    .filter(({ source }) =>
      /^\s*(["'])use server\1\s*;?/m.test(
        source.split("\n").slice(0, 3).join("\n"),
      ),
    );
}

test('every "use server" module is discovered', () => {
  // Guards the walker itself: a broken glob would make the assertions below
  // pass vacuously.
  assert.ok(
    serverModules().length >= 15,
    `expected to find the repo's "use server" modules, found ${serverModules().length}`,
  );
});

test('no "use server" export is an unguarded public endpoint', () => {
  const offenders = serverModules().flatMap(({ file, source }) =>
    checkPiiRules(file, source)
      .filter((v) => v.rule === "pii/unguarded-server-action")
      .map((v) => `  ${v.file}:${v.line} → ${v.snippet}`),
  );

  assert.deepEqual(
    offenders,
    [],
    `Unguarded Server Action export(s) — every export of a "use server" module is a publicly callable endpoint:\n${offenders.join("\n")}`,
  );
});

test('no "use server" module has a non-async export', () => {
  const offenders = serverModules().flatMap(({ file, source }) =>
    checkPiiRules(file, source)
      .filter((v) => v.rule === "pii/non-async-server-action-export")
      .map((v) => `  ${v.file}:${v.line} → ${v.snippet}`),
  );

  assert.deepEqual(
    offenders,
    [],
    `Non-async export(s) in a "use server" module — Next.js strips ALL exports from such a module:\n${offenders.join("\n")}`,
  );
});

test("the relocated PII helpers are not Server Actions", () => {
  // Direct regression lock for the two endpoints closed by the authz fix: if
  // someone "helpfully" re-adds the directive, this fails loudly.
  for (const file of [
    "src/lib/user-contact.ts",
    "src/lib/payment-confirmation.ts",
  ]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.equal(
      /^\s*(["'])use server\1/m.test(source),
      false,
      `${file} must not be a "use server" module — it takes an arbitrary id and returns or emails PII`,
    );
  }
});
