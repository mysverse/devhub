import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DuitNowIdType as PrismaDuitNowIdType } from "@prisma/client";
import type { DuitNowIdType } from "@/lib/duitnow-id";
import { buildDuitNowWrite } from "@/lib/payment-profile";

/**
 * The hand-written union in duitnow-id.ts and the generated Prisma enum must
 * stay identical — the module is client-safe and cannot import the generated
 * one, so this is what stops them drifting.
 */
const _typesMatch: PrismaDuitNowIdType = "MOBILE" satisfies DuitNowIdType;
const _typesMatchBack: DuitNowIdType =
  "ARMY_POLICE" satisfies PrismaDuitNowIdType;
void _typesMatch;
void _typesMatchBack;

const NOW = new Date("2026-08-19T00:00:00Z");
const CURRENT = {
  duitNowId: "+60123456789",
  duitNowIdType: "MOBILE" as DuitNowIdType,
};

describe("buildDuitNowWrite", () => {
  it("normalizes per type rather than through the phone normalizer", () => {
    assert.equal(
      buildDuitNowWrite(
        { duitNowId: "1234567-A", duitNowIdType: "BUSINESS_REG" },
        null,
        NOW,
      ).duitNowId,
      "1234567A",
    );
    assert.equal(
      buildDuitNowWrite(
        { duitNowId: "0123456789", duitNowIdType: "ARMY_POLICE" },
        null,
        NOW,
      ).duitNowId,
      "0123456789",
    );
    assert.equal(
      buildDuitNowWrite(
        { duitNowId: "012-345 6789", duitNowIdType: "MOBILE" },
        null,
        NOW,
      ).duitNowId,
      "+60123456789",
    );
  });

  it("still phone-normalizes an untyped value, which can only be legacy", () => {
    const write = buildDuitNowWrite({ duitNowId: "012-345 6789" }, null, NOW);
    assert.equal(write.duitNowId, "+60123456789");
    assert.equal(write.duitNowIdType, null);
  });

  /**
   * The regression this module exists for: an admin's bank lookup must not
   * survive the developer editing the value it was about.
   */
  it("clears a recorded lookup when the identifier changes", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60198765432", duitNowIdType: "MOBILE" },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
    assert.equal(write.duitNowIdCheckedAt, null);
    assert.equal(write.duitNowIdIssue, null);
  });

  it("clears a recorded lookup when only the type changes", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60123456789", duitNowIdType: "NRIC" },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
  });

  /**
   * Saving an unrelated field — a shipping address, a display name — goes
   * through this same write, so an unchanged identifier must leave the status
   * columns alone entirely rather than resetting them.
   */
  it("leaves the status untouched when the identifier is unchanged", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60123456789", duitNowIdType: "MOBILE" },
      CURRENT,
      NOW,
    );
    assert.deepEqual(write, {
      duitNowId: "+60123456789",
      duitNowIdType: "MOBILE",
    });
    assert.equal("duitNowIdStatus" in write, false);
  });

  it("treats differently-formatted input for the same number as unchanged", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "012-345 6789", duitNowIdType: "MOBILE" },
      CURRENT,
      NOW,
    );
    assert.equal("duitNowIdStatus" in write, false);
  });

  it("records CONFIRMED only when the developer ticked the checklist", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60198765432", duitNowIdType: "MOBILE", confirmed: true },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "CONFIRMED");
    assert.equal(write.duitNowIdCheckedAt?.toISOString(), NOW.toISOString());
  });

  it("re-confirms an unchanged identifier when asked to", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60123456789", duitNowIdType: "MOBILE", confirmed: true },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "CONFIRMED");
  });

  it("clears everything when the proxy is removed entirely", () => {
    const write = buildDuitNowWrite({}, CURRENT, NOW);
    assert.equal(write.duitNowId, null);
    assert.equal(write.duitNowIdType, null);
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
  });

  it("treats blank input as absent rather than as a change to empty string", () => {
    assert.equal(
      buildDuitNowWrite({ duitNowId: "   " }, null, NOW).duitNowId,
      null,
    );
  });
});
