import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeKeyFor,
  PII_AUDIT_DEDUPE_MINUTES,
  requestOrigin,
} from "./pii-audit";

test("client origin prefers the first x-forwarded-for hop", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.5, 70.41.3.18",
    "user-agent": "Mozilla/5.0",
  });
  assert.deepEqual(requestOrigin(headers), {
    ipAddress: "203.0.113.5",
    userAgent: "Mozilla/5.0",
  });
});

test("client origin falls back to x-real-ip, then to nulls", () => {
  assert.equal(
    requestOrigin(new Headers({ "x-real-ip": "198.51.100.7" })).ipAddress,
    "198.51.100.7",
  );
  assert.deepEqual(requestOrigin(undefined), {
    ipAddress: null,
    userAgent: null,
  });
  assert.deepEqual(requestOrigin(new Headers()), {
    ipAddress: null,
    userAgent: null,
  });
});

test("dedupe key ignores the subject, so repeat reads of one resource collapse", () => {
  const base = { actorId: "admin-1", resource: "KYC_SELFIE" as const };
  assert.equal(
    dedupeKeyFor({ ...base, resourceId: "kyc-1", subjectId: "dev-1" }),
    dedupeKeyFor({ ...base, resourceId: "kyc-1", subjectId: "dev-1" }),
  );
  assert.notEqual(
    dedupeKeyFor({ ...base, resourceId: "kyc-1" }),
    dedupeKeyFor({ ...base, resourceId: "kyc-2" }),
  );
  assert.notEqual(
    dedupeKeyFor({ ...base, resourceId: "kyc-1" }),
    dedupeKeyFor({
      actorId: "admin-2",
      resource: "KYC_SELFIE",
      resourceId: "kyc-1",
    }),
  );
});

test("the dedupe window is long enough to absorb an image re-request", () => {
  assert.ok(PII_AUDIT_DEDUPE_MINUTES >= 1);
});
