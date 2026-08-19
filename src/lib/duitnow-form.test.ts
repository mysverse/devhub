import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DuitNowValue,
  duitNowFieldErrors,
  initialDuitNowMode,
  needsDuitNowConfirmation,
} from "@/lib/duitnow-form";

function value(overrides: Partial<DuitNowValue> = {}): DuitNowValue {
  return {
    mode: "ID",
    idType: "MOBILE",
    duitNowId: "+60123456789",
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
  it("passes a well-formed proxy", () => {
    assert.deepEqual(duitNowFieldErrors(value()), {});
  });

  it("asks for the type before complaining about the value", () => {
    const errors = duitNowFieldErrors(value({ idType: null, duitNowId: "" }));
    assert.ok(errors.duitNowIdType);
    assert.equal(errors.duitNowId, undefined);
  });

  it("surfaces the per-type rule against the duitNowId field", () => {
    const errors = duitNowFieldErrors(value({ duitNowId: "03-1234 5678" }));
    assert.match(errors.duitNowId ?? "", /landline/i);
  });

  it("accepts the three types the old validator refused", () => {
    assert.deepEqual(
      duitNowFieldErrors(value({ idType: "PASSPORT", duitNowId: "A12345678" })),
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

  it("checks only the bank fields on the bank branch", () => {
    const errors = duitNowFieldErrors(
      value({ mode: "BANK", duitNowId: "nonsense" }),
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

  it("does not ask before a type has been picked", () => {
    assert.equal(
      needsDuitNowConfirmation(value({ idType: null }), confirmed),
      false,
    );
  });
});
