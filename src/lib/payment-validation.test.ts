import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  DUITNOW_BANK_MAP,
  getBankDisplayName,
  isBillplzSupported,
  normalizeMalaysianPhone,
  paymentSuperRefine,
  validateBankAccountNumber,
  validateDuitNowId,
} from "@/lib/payment-validation";

const Schema = z
  .object({
    paymentMethod: z.string(),
    paypalEmail: z.string().nullish(),
    duitNowId: z.string().nullish(),
    duitNowType: z.string().nullish(),
    duitNowIdType: z.string().nullish(),
    duitNowIdCountry: z.string().nullish(),
    duitNowIdInstitution: z.string().nullish(),
    bankName: z.string().nullish(),
    bankAccountNumber: z.string().nullish(),
    bankAccountName: z.string().nullish(),
  })
  .superRefine(paymentSuperRefine);

type Draft = Partial<z.input<typeof Schema>> & { paymentMethod: string };

/** The field paths that failed, which is what the forms key their errors off. */
function failedPaths(draft: Draft): string[] {
  const result = Schema.safeParse(draft);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

const VALID_BANK = {
  bankName: "MBBEMYKL",
  bankAccountNumber: "512345678901",
  bankAccountName: "Nurul Aina binti Ahmad",
};

describe("paymentSuperRefine — PayPal", () => {
  it("requires an email", () => {
    assert.deepEqual(failedPaths({ paymentMethod: "PAYPAL" }), ["paypalEmail"]);
    assert.deepEqual(
      failedPaths({ paymentMethod: "PAYPAL", paypalEmail: "a@b.com" }),
      [],
    );
  });
});

describe("paymentSuperRefine — DuitNow by proxy ID", () => {
  it("accepts a mobile number or an NRIC", () => {
    for (const duitNowId of ["+60123456789", "990101141234"]) {
      assert.deepEqual(
        failedPaths({ paymentMethod: "DUITNOW", duitNowType: "ID", duitNowId }),
        [],
        duitNowId,
      );
    }
  });

  it("reports a bad ID against the duitNowId field", () => {
    assert.deepEqual(
      failedPaths({
        paymentMethod: "DUITNOW",
        duitNowType: "ID",
        duitNowId: "nonsense",
      }),
      ["duitNowId"],
    );
  });
});

describe("paymentSuperRefine — DuitNow by bank account", () => {
  it("accepts a known institution with a numeric account", () => {
    assert.deepEqual(
      failedPaths({
        paymentMethod: "DUITNOW",
        duitNowType: "BANK",
        ...VALID_BANK,
      }),
      [],
    );
  });

  it("rejects an institution that is not a DuitNow participant", () => {
    assert.deepEqual(
      failedPaths({
        paymentMethod: "DUITNOW",
        duitNowType: "BANK",
        ...VALID_BANK,
        bankName: "Maybank",
      }),
      ["bankName"],
    );
  });

  it("names every missing bank field at once", () => {
    assert.deepEqual(
      failedPaths({ paymentMethod: "DUITNOW", duitNowType: "BANK" }),
      ["bankName", "bankAccountNumber", "bankAccountName"],
    );
  });
});

describe("paymentSuperRefine — mode inference", () => {
  /**
   * Onboarding does not send duitNowType, so the mode is inferred from which
   * fields are populated. These pin that fallback: it is the only thing
   * standing between an onboarding submission and the wrong branch's rules.
   */
  it("infers ID mode from a lone duitNowId", () => {
    assert.deepEqual(
      failedPaths({ paymentMethod: "DUITNOW", duitNowId: "+60123456789" }),
      [],
    );
  });

  it("infers bank mode from a lone account number", () => {
    assert.deepEqual(
      failedPaths({ paymentMethod: "DUITNOW", ...VALID_BANK }),
      [],
    );
  });

  it("asks for one or the other when neither is present", () => {
    assert.deepEqual(failedPaths({ paymentMethod: "DUITNOW" }), ["duitNowId"]);
  });
});

describe("paymentSuperRefine — international bank transfer", () => {
  it("takes a free-text bank name but still demands the triple", () => {
    assert.deepEqual(
      failedPaths({
        paymentMethod: "BANK_TRANSFER",
        bankName: "Chase",
        bankAccountNumber: "12345678",
        bankAccountName: "John Doe",
      }),
      [],
    );
    assert.deepEqual(failedPaths({ paymentMethod: "BANK_TRANSFER" }), [
      "bankName",
      "bankAccountNumber",
      "bankAccountName",
    ]);
  });

  /**
   * Documents a real limitation rather than endorsing it: the field is
   * labelled "Account Number / IBAN" in both forms, but the validator is
   * digits-only, so an alphanumeric IBAN cannot be saved.
   */
  it("cannot accept an alphanumeric IBAN despite the field label", () => {
    assert.ok(validateBankAccountNumber("GB33BUKB20201555555555"));
  });
});

describe("routing helpers", () => {
  it("marks the Billplz-supported banks and nothing else", () => {
    assert.ok(isBillplzSupported("MBBEMYKL"));
    assert.ok(!isBillplzSupported(null));
  });

  /**
   * eWallet institutions stay selectable and payable — manually.
   *
   * They were never automatically payable: the Xendit eWallet branch that
   * claimed to handle them required a BIC to be both KYC-gated and
   * Xendit-disbursable, and those two sets were disjoint, so it could not
   * fire. Xendit is gone; this pins that the institutions themselves remain,
   * because removing them would strand anyone already paid to one.
   */
  it("keeps eWallet institutions selectable, on the manual path", () => {
    for (const code of [
      "TNGDMYNB",
      "BOSTMYNB",
      "ARPYMYNB",
      "BGPYMYNB",
      "SVSBMYNB",
      "MASBMYNB",
      "FSPYMYNB",
      "FNXSMYNB",
    ]) {
      assert.ok(DUITNOW_BANK_MAP[code], `${code} must stay in the map`);
      assert.ok(!isBillplzSupported(code), `${code} is not auto-payable`);
    }
  });

  it("falls back to the stored string for legacy free-text bank names", () => {
    assert.equal(getBankDisplayName("MBBEMYKL"), "Maybank");
    assert.equal(getBankDisplayName("Some Legacy Bank"), "Some Legacy Bank");
    assert.equal(getBankDisplayName(null), "");
  });
});

describe("re-exported helpers keep their single implementation", () => {
  it("still normalizes phones through payment-validation's export", () => {
    assert.equal(normalizeMalaysianPhone("012-345 6789"), "+60123456789");
  });

  it("still validates DuitNow IDs through payment-validation's export", () => {
    assert.equal(validateDuitNowId("+60123456789"), null);
    assert.ok(validateDuitNowId(""));
  });
});

/**
 * A typed proxy — every submission from the current form — also has to say
 * where it is linked, and a passport which country issued it. The untyped
 * path above is what legacy rows re-save through and is left alone.
 */
describe("paymentSuperRefine — typed proxy ID", () => {
  const MOBILE = {
    paymentMethod: "DUITNOW",
    duitNowType: "ID",
    duitNowIdType: "MOBILE",
    duitNowId: "+60123456789",
    duitNowIdInstitution: "TNGDMYNB",
  };
  const PASSPORT = {
    ...MOBILE,
    duitNowIdType: "PASSPORT",
    duitNowId: "A12345678",
    duitNowIdCountry: "SG",
  };

  it("passes a typed proxy that names its linked institution", () => {
    assert.deepEqual(failedPaths(MOBILE), []);
    assert.deepEqual(failedPaths(PASSPORT), []);
  });

  it("requires the linked institution", () => {
    assert.deepEqual(failedPaths({ ...MOBILE, duitNowIdInstitution: null }), [
      "duitNowIdInstitution",
    ]);
  });

  it("rejects an institution outside the DuitNow participant list", () => {
    assert.deepEqual(
      failedPaths({ ...MOBILE, duitNowIdInstitution: "NOPEMYKL" }),
      ["duitNowIdInstitution"],
    );
  });

  it("requires an issuing country for a passport", () => {
    assert.deepEqual(failedPaths({ ...PASSPORT, duitNowIdCountry: null }), [
      "duitNowIdCountry",
    ]);
  });

  it("rejects an issuing country it does not know", () => {
    assert.deepEqual(failedPaths({ ...PASSPORT, duitNowIdCountry: "XX" }), [
      "duitNowIdCountry",
    ]);
  });

  it("does not ask a non-passport proxy for a country", () => {
    assert.deepEqual(failedPaths({ ...MOBILE, duitNowIdCountry: "SG" }), []);
    assert.deepEqual(failedPaths({ ...MOBILE, duitNowIdCountry: null }), []);
  });

  it("reports the fields in the order the screen shows them", () => {
    assert.deepEqual(
      failedPaths({
        ...PASSPORT,
        duitNowIdCountry: null,
        duitNowId: "A-1",
        duitNowIdInstitution: null,
      }),
      ["duitNowIdCountry", "duitNowId", "duitNowIdInstitution"],
    );
  });

  it("leaves an untyped legacy submission alone", () => {
    assert.deepEqual(
      failedPaths({
        paymentMethod: "DUITNOW",
        duitNowType: "ID",
        duitNowId: "+60123456789",
      }),
      [],
    );
  });
});
