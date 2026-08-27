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
  duitNowIdCountry: null,
  duitNowIdInstitution: "MBBEMYKL",
};
const PASSPORT = {
  duitNowId: "A12345678",
  duitNowIdType: "PASSPORT" as DuitNowIdType,
  duitNowIdCountry: "SG",
  duitNowIdInstitution: "TNGDMYNB",
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
      {
        duitNowId: "+60198765432",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "MBBEMYKL",
      },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
    assert.equal(write.duitNowIdCheckedAt, null);
    assert.equal(write.duitNowIdIssue, null);
  });

  it("clears a recorded lookup when only the type changes", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "+60123456789",
        duitNowIdType: "NRIC",
        duitNowIdInstitution: "MBBEMYKL",
      },
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
      {
        duitNowId: "+60123456789",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "MBBEMYKL",
      },
      CURRENT,
      NOW,
    );
    assert.deepEqual(write, {
      duitNowId: "+60123456789",
      duitNowIdType: "MOBILE",
      duitNowIdCountry: null,
      duitNowIdInstitution: "MBBEMYKL",
    });
    assert.equal("duitNowIdStatus" in write, false);
  });

  it("treats differently-formatted input for the same number as unchanged", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "012-345 6789",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "MBBEMYKL",
      },
      CURRENT,
      NOW,
    );
    assert.equal("duitNowIdStatus" in write, false);
  });

  it("records CONFIRMED only when the developer ticked the checklist", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "+60198765432",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "MBBEMYKL",
        confirmed: true,
      },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "CONFIRMED");
    assert.equal(write.duitNowIdCheckedAt?.toISOString(), NOW.toISOString());
  });

  it("re-confirms an unchanged identifier when asked to", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "+60123456789",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "MBBEMYKL",
        confirmed: true,
      },
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

describe("buildDuitNowWrite — issuing country", () => {
  it("stores the issuing country, uppercased, on a passport", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "a12345678",
        duitNowIdType: "PASSPORT",
        duitNowIdCountry: "sg",
        duitNowIdInstitution: "TNGDMYNB",
      },
      null,
      NOW,
    );
    assert.equal(write.duitNowId, "A12345678");
    assert.equal(write.duitNowIdCountry, "SG");
  });

  it("drops a country that arrived with a non-passport type", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "990101141234",
        duitNowIdType: "NRIC",
        duitNowIdCountry: "SG",
        duitNowIdInstitution: "MBBEMYKL",
      },
      null,
      NOW,
    );
    assert.equal(write.duitNowIdCountry, null);
  });

  it("clears a recorded lookup when the issuing country changes", () => {
    const write = buildDuitNowWrite(
      { ...PASSPORT, duitNowIdCountry: "ID" },
      PASSPORT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
  });

  it("leaves an unchanged passport alone", () => {
    const write = buildDuitNowWrite(PASSPORT, PASSPORT, NOW);
    assert.equal("duitNowIdStatus" in write, false);
    assert.equal(write.duitNowIdCountry, "SG");
  });
});

describe("buildDuitNowWrite — linked institution", () => {
  it("clears a recorded lookup when the ID moves to another institution", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "+60123456789",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "TNGDMYNB",
      },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
    assert.equal(write.duitNowIdInstitution, "TNGDMYNB");
  });

  it("clears a recorded lookup when the institution is removed", () => {
    const write = buildDuitNowWrite(
      { duitNowId: "+60123456789", duitNowIdType: "MOBILE" },
      CURRENT,
      NOW,
    );
    assert.equal(write.duitNowIdStatus, "UNCONFIRMED");
    assert.equal(write.duitNowIdInstitution, null);
  });

  /**
   * Every row that predates the column has no institution. A developer filling
   * that in is adding a fact about the same proxy, not changing which proxy it
   * is — an admin's lookup, or their own earlier confirmation, still stands.
   */
  it("keeps a recorded lookup when a legacy row gains its first institution", () => {
    const write = buildDuitNowWrite(
      {
        duitNowId: "+60123456789",
        duitNowIdType: "MOBILE",
        duitNowIdInstitution: "TNGDMYNB",
      },
      { ...CURRENT, duitNowIdInstitution: null },
      NOW,
    );
    assert.equal("duitNowIdStatus" in write, false);
    assert.equal(write.duitNowIdInstitution, "TNGDMYNB");
  });

  it("nulls the country and institution when the proxy is removed", () => {
    const write = buildDuitNowWrite(
      { duitNowIdCountry: "SG", duitNowIdInstitution: "TNGDMYNB" },
      PASSPORT,
      NOW,
    );
    assert.equal(write.duitNowId, null);
    assert.equal(write.duitNowIdCountry, null);
    assert.equal(write.duitNowIdInstitution, null);
  });
});
