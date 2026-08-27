import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDuitNowPatch,
  type DuitNowValue,
  duitNowFieldErrors,
  initialDuitNowMode,
  needsDuitNowConfirmation,
} from "@/lib/duitnow-form";

function value(overrides: Partial<DuitNowValue> = {}): DuitNowValue {
  return {
    mode: "ID",
    idType: "MOBILE",
    idCountry: null,
    duitNowId: "+60123456789",
    idInstitution: "TNGDMYNB",
    linked: true,
    ownName: true,
    bankName: null,
    bankAccountNumber: "",
    bankAccountName: "",
    ...overrides,
  };
}

describe("initialDuitNowMode", () => {
  it("opens a proxy-only developer on the proxy branch", () => {
    assert.equal(
      initialDuitNowMode({
        duitNowId: "+60123456789",
        bankAccountNumber: null,
      }),
      "ID",
    );
  });

  /**
   * Only the rendered branch has inputs and the action writes every payment
   * column unconditionally, so the branch that opens is the branch that
   * survives the next save. Bank details win, matching classifyPayoutRoute —
   * otherwise saving an unrelated field would drop an auto-payable developer
   * onto the manual path.
   */
  it("opens on the bank branch when a developer has both", () => {
    assert.equal(
      initialDuitNowMode({
        duitNowId: "+60123456789",
        bankAccountNumber: "512345678901",
      }),
      "BANK",
    );
  });

  it("defaults a developer with neither to the recommended branch", () => {
    assert.equal(
      initialDuitNowMode({ duitNowId: null, bankAccountNumber: null }),
      "BANK",
    );
  });
});

describe("duitNowFieldErrors", () => {
  it("passes a well-formed, linked, confirmed proxy", () => {
    assert.deepEqual(duitNowFieldErrors(value()), {});
  });

  it("asks for the type before complaining about anything else", () => {
    const errors = duitNowFieldErrors(
      value({ idType: null, duitNowId: "", idInstitution: null }),
    );
    assert.deepEqual(Object.keys(errors), ["duitNowIdType"]);
  });

  it("surfaces the per-type rule against the duitNowId field", () => {
    const errors = duitNowFieldErrors(value({ duitNowId: "03-1234 5678" }));
    assert.match(errors.duitNowId ?? "", /landline/i);
  });

  it("accepts the three types the old validator refused", () => {
    assert.deepEqual(
      duitNowFieldErrors(
        value({ idType: "PASSPORT", idCountry: "SG", duitNowId: "A12345678" }),
      ),
      {},
    );
    assert.deepEqual(
      duitNowFieldErrors(
        value({ idType: "BUSINESS_REG", duitNowId: "202001012345" }),
      ),
      {},
    );
    assert.deepEqual(
      duitNowFieldErrors(
        value({ idType: "ARMY_POLICE", duitNowId: "T1234567" }),
      ),
      {},
    );
  });

  it("requires an issuing country for a passport, and only a passport", () => {
    assert.deepEqual(
      Object.keys(
        duitNowFieldErrors(
          value({ idType: "PASSPORT", duitNowId: "A12345678" }),
        ),
      ),
      ["duitNowIdCountry"],
    );
    assert.deepEqual(duitNowFieldErrors(value({ idCountry: null })), {});
  });

  it("requires the bank or e-wallet the ID is linked at", () => {
    assert.deepEqual(
      Object.keys(duitNowFieldErrors(value({ idInstitution: null }))),
      ["duitNowIdInstitution"],
    );
    assert.deepEqual(
      Object.keys(duitNowFieldErrors(value({ idInstitution: "NOPEMYKL" }))),
      ["duitNowIdInstitution"],
    );
  });

  it("requires both boxes when the value needs confirming", () => {
    const errors = duitNowFieldErrors(
      value({ linked: false, ownName: false }),
      {
        attest: true,
      },
    );
    assert.deepEqual(Object.keys(errors).sort(), [
      "duitNowLinked",
      "duitNowOwnName",
    ]);
    assert.match(errors.duitNowLinked ?? "", /payout waits/);
  });

  it("skips the boxes when the value is already confirmed", () => {
    assert.deepEqual(
      duitNowFieldErrors(value({ linked: false, ownName: false }), {
        attest: false,
      }),
      {},
    );
  });

  it("reports the proxy fields in screen order", () => {
    const errors = duitNowFieldErrors(
      value({
        idType: "PASSPORT",
        idCountry: null,
        duitNowId: "A-1",
        idInstitution: null,
        linked: false,
        ownName: false,
      }),
    );
    assert.deepEqual(Object.keys(errors), [
      "duitNowIdCountry",
      "duitNowId",
      "duitNowIdInstitution",
      "duitNowLinked",
      "duitNowOwnName",
    ]);
  });

  it("checks only the bank fields on the bank branch", () => {
    const errors = duitNowFieldErrors(
      value({ mode: "BANK", duitNowId: "nonsense", linked: false }),
    );
    assert.equal(errors.duitNowId, undefined);
    assert.deepEqual(Object.keys(errors).sort(), [
      "bankAccountName",
      "bankAccountNumber",
      "bankName",
    ]);
  });

  it("passes a complete bank triple", () => {
    assert.deepEqual(
      duitNowFieldErrors(
        value({
          mode: "BANK",
          bankName: "MBBEMYKL",
          bankAccountNumber: "512345678901",
          bankAccountName: "Nurul Aina binti Ahmad",
        }),
      ),
      {},
    );
  });
});

describe("needsDuitNowConfirmation", () => {
  const confirmed = {
    duitNowId: "+60123456789",
    duitNowIdType: "MOBILE",
    duitNowIdCountry: null,
    duitNowIdInstitution: "TNGDMYNB",
    duitNowIdStatus: "CONFIRMED",
  };

  it("never asks on the bank branch — a bank account is not a proxy", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ mode: "BANK" }), confirmed),
      false,
    );
  });

  it("does not re-ask for an identifier already confirmed", () => {
    assert.equal(needsDuitNowConfirmation(value(), confirmed), false);
  });

  it("ignores formatting when deciding whether it changed", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ duitNowId: "012-345 6789" }), confirmed),
      false,
    );
  });

  it("asks again when the identifier changes", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ duitNowId: "+60198765432" }), confirmed),
      true,
    );
  });

  it("asks again when only the type changes", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ idType: "NRIC" }), confirmed),
      true,
    );
  });

  it("asks again when a passport's issuing country changes", () => {
    const passport = value({
      idType: "PASSPORT",
      idCountry: "SG",
      duitNowId: "A12345678",
    });
    const stored = {
      ...confirmed,
      duitNowId: "A12345678",
      duitNowIdType: "PASSPORT",
      duitNowIdCountry: "SG",
    };
    assert.equal(needsDuitNowConfirmation(passport, stored), false);
    assert.equal(
      needsDuitNowConfirmation({ ...passport, idCountry: "ID" }, stored),
      true,
    );
  });

  it("asks again when the ID moves to another institution", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ idInstitution: "MBBEMYKL" }), confirmed),
      true,
    );
  });

  /** Rows that predate the column: naming the app adds a fact, not a change. */
  it("does not ask a legacy row that is adding its first institution", () => {
    assert.equal(
      needsDuitNowConfirmation(value(), {
        ...confirmed,
        duitNowIdInstitution: null,
      }),
      false,
    );
  });

  /** How rows left UNCONFIRMED by the backfill get collected. */
  it("asks once for a stored identifier nobody has confirmed", () => {
    assert.equal(
      needsDuitNowConfirmation(value(), {
        ...confirmed,
        duitNowIdStatus: "UNCONFIRMED",
      }),
      true,
    );
  });

  /** The settings banner says "save it again" — saving again has to re-ask. */
  it("asks again after the bank could not reach it", () => {
    assert.equal(
      needsDuitNowConfirmation(value(), {
        ...confirmed,
        duitNowIdStatus: "UNREACHABLE",
      }),
      true,
    );
  });

  it("always asks when nothing is stored", () => {
    assert.equal(needsDuitNowConfirmation(value(), null), true);
  });

  it("does not ask before a type has been picked", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ idType: null }), confirmed),
      false,
    );
  });
});

describe("applyDuitNowPatch", () => {
  it("unticks both boxes when any part of the identity changes", () => {
    for (const patch of [
      { duitNowId: "+60198765432" },
      { idType: "NRIC" as const },
      { idInstitution: "MBBEMYKL" },
      { mode: "BANK" as const },
    ]) {
      const next = applyDuitNowPatch(value(), patch);
      assert.equal(next.linked, false, JSON.stringify(patch));
      assert.equal(next.ownName, false, JSON.stringify(patch));
    }
  });

  it("unticks both boxes when a passport's country changes", () => {
    const passport = value({ idType: "PASSPORT", idCountry: "SG" });
    const next = applyDuitNowPatch(passport, { idCountry: "ID" });
    assert.equal(next.linked, false);
    assert.equal(next.idCountry, "ID");
  });

  it("keeps the boxes when only a box toggles", () => {
    const next = applyDuitNowPatch(value({ ownName: false }), {
      ownName: true,
    });
    assert.equal(next.linked, true);
    assert.equal(next.ownName, true);
  });

  it("keeps the boxes when a patch restates the same value", () => {
    const next = applyDuitNowPatch(value(), { duitNowId: "+60123456789" });
    assert.equal(next.linked, true);
  });

  it("drops the country when the type leaves passport", () => {
    const passport = value({ idType: "PASSPORT", idCountry: "SG" });
    assert.equal(
      applyDuitNowPatch(passport, { idType: "MOBILE", duitNowId: "" })
        .idCountry,
      null,
    );
    assert.equal(applyDuitNowPatch(passport, { linked: true }).idCountry, "SG");
  });
});
