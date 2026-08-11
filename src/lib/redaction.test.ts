import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createExactRedactor,
  REDACTED_EMAIL,
  REDACTED_NUMBER,
  REDACTED_PERSONAL,
  REDACTED_SECRET,
  redactPatterns,
} from "./redaction";

test("an email address never survives", () => {
  assert.equal(
    redactPatterns("ping alex@example.com when it ships"),
    `ping ${REDACTED_EMAIL} when it ships`,
  );
});

test("a phone number survives neither spacing nor punctuation", () => {
  for (const written of [
    "0198765432",
    "+60 19-876 5432",
    "019-876 5432",
    "(019) 876-5432",
    "+6 (019) 876 5432",
  ]) {
    assert.equal(
      redactPatterns(`call ${written} today`),
      `call ${REDACTED_NUMBER} today`,
      `expected ${written} to be redacted`,
    );
  }
});

test("a bank account number is redacted as a number", () => {
  assert.equal(
    redactPatterns("account 514812345678 at Maybank"),
    `account ${REDACTED_NUMBER} at Maybank`,
  );
});

test("an estimate, a year and an issue number are left alone", () => {
  const kept = "MYS-201 is a 3 pointer, due 2026, see step-2";
  assert.equal(redactPatterns(kept), kept);
});

test("an API key is redacted", () => {
  assert.equal(
    redactPatterns("use sk-abcdefghijklmnop to authenticate"),
    `use ${REDACTED_SECRET} to authenticate`,
  );
});

test("a legal name has no shape, so only the exact pass catches it", () => {
  const text = "Paid to Alexander Tan Wei Ming last Friday";
  assert.equal(redactPatterns(text), text);
  assert.equal(
    createExactRedactor(["Alexander Tan Wei Ming"])(text),
    `Paid to ${REDACTED_PERSONAL} last Friday`,
  );
});

test("longer values are replaced first, so no fragment is left legible", () => {
  // "Tan" first would leave "[redacted] Jun Yan" — the full name still readable
  // and now unmatchable, which is the bug the longest-first sort prevents.
  const redact = createExactRedactor(["Tan", "Tan Jun Yan"]);
  assert.equal(
    redact("signed by Tan Jun Yan"),
    `signed by ${REDACTED_PERSONAL}`,
  );
});

test("blank and missing values are dropped rather than matched everywhere", () => {
  const redact = createExactRedactor([null, undefined, "", "   "]);
  assert.equal(redact("nothing personal here"), "nothing personal here");
});

test("surrounding whitespace on a stored value does not defeat the match", () => {
  const redact = createExactRedactor(["  12 Jalan Contoh  "]);
  assert.equal(
    redact("ship to 12 Jalan Contoh please"),
    `ship to ${REDACTED_PERSONAL} please`,
  );
});

test("both layers run: patterns first, then exact values", () => {
  const redact = createExactRedactor(["Alexander Tan"]);
  assert.equal(
    redact("Alexander Tan, alex@example.com, 0198765432"),
    `${REDACTED_PERSONAL}, ${REDACTED_EMAIL}, ${REDACTED_NUMBER}`,
  );
});
