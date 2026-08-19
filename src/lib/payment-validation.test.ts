import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  getBankDisplayName,
  isBillplzSupported,
  isXenditSupported,
  normalizeMalaysianPhone,
  paymentSuperRefine,
  requiresKycForAutoPayout,
  validateBankAccountNumber,
  validateDuitNowId,
  XENDIT_EWALLET_CODES,
} from "@/lib/payment-validation";

const Schema = z
  .object({
    paymentMethod: z.string(),
    paypalEmail: z.string().nullish(),
    duitNowId: z.string().nullish(),
    duitNowType: z.string().nullish(),
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
  it("separates Billplz banks from KYC-gated eWallets", () => {
    assert.ok(isBillplzSupported("MBBEMYKL"));
    assert.ok(!isBillplzSupported("TNGDMYNB"));
    assert.ok(requiresKycForAutoPayout("TNGDMYNB"));
    assert.ok(!requiresKycForAutoPayout("MBBEMYKL"));
    assert.ok(!isBillplzSupported(null));
  });

  /**
   * Pins a live contradiction rather than endorsing it.
   *
   * `requiresKycForAutoPayout` is true only for the eight eWallet BICs, but
   * `BIC_TO_XENDIT_BANK_CODE` — which backs `isXenditSupported` — contains
   * only banks. So no BIC satisfies both, and the eWallet branch in
   * `initiateAutoPayout` (payout.ts:563-583) and in `classifyPayoutRoute`
   * (payout-routing.ts:178-188) cannot fire: an eWallet developer is asked to
   * enable auto-payout and pass KYC, and then hits `return null`.
   *
   * If Xendit eWallet disbursement is meant to work, the eWallet BICs need
   * Xendit channel codes. If it is not, the KYC gate should stop asking people
   * for government ID and a selfie. Either way this assertion should change.
   */
  it("has no BIC that is both KYC-gated and Xendit-disbursable", () => {
    const gatedAndSupported = [...XENDIT_EWALLET_CODES].filter((code) =>
      isXenditSupported(code),
    );
    assert.deepEqual(gatedAndSupported, []);
    assert.ok(!isXenditSupported("TNGDMYNB"));
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
