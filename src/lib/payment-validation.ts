import type { z } from "zod";

// Malaysian phone number: starts with 01, 10-11 digits total
const MY_PHONE_REGEX = /^01\d{8,9}$/;

// Malaysian NRIC: exactly 12 digits (YYMMDD-SS-NNNG)
const MY_NRIC_REGEX = /^\d{12}$/;

// Roblox username: 3-20 chars, alphanumeric + underscores
const ROBUX_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// Bank account number: 5-20 digits
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{5,20}$/;

/**
 * DuitNow-participating institutions sourced from PayNet's official list.
 * https://www.paynet.my/personal-solutions/duitnow-transfer.html
 */
export const DUITNOW_INSTITUTIONS: {
  group: string;
  items: { value: string; label: string }[];
}[] = [
  {
    group: "Banks",
    items: [
      { value: "Aeon Bank", label: "Aeon Bank" },
      { value: "Affin Bank", label: "Affin Bank" },
      { value: "Affin Islamic", label: "Affin Islamic" },
      { value: "Agro Bank", label: "Agro Bank" },
      { value: "Al Rajhi Bank", label: "Al Rajhi Bank" },
      { value: "Alliance Bank", label: "Alliance Bank" },
      { value: "Alliance Islamic", label: "Alliance Islamic" },
      { value: "AmBank", label: "AmBank" },
      { value: "AmBank Islamic", label: "AmBank Islamic" },
      { value: "Bank Islam", label: "Bank Islam" },
      { value: "Bank of America", label: "Bank of America" },
      { value: "Bank of China", label: "Bank of China" },
      { value: "Bank Muamalat", label: "Bank Muamalat" },
      { value: "Bank Rakyat", label: "Bank Rakyat" },
      { value: "BSN", label: "BSN" },
      { value: "CCB", label: "CCB" },
      { value: "CIMB", label: "CIMB" },
      { value: "CIMB Islamic", label: "CIMB Islamic" },
      { value: "Citibank", label: "Citibank" },
      { value: "Deutsche Bank", label: "Deutsche Bank" },
      { value: "GX Bank", label: "GX Bank" },
      { value: "Hong Leong Bank", label: "Hong Leong Bank" },
      { value: "Hong Leong Islamic", label: "Hong Leong Islamic" },
      { value: "HSBC", label: "HSBC" },
      { value: "HSBC Amanah", label: "HSBC Amanah" },
      { value: "ICBC", label: "ICBC" },
      { value: "JP Morgan", label: "JP Morgan" },
      { value: "Kuwait Finance House", label: "Kuwait Finance House" },
      { value: "Maybank", label: "Maybank" },
      { value: "Maybank Islamic", label: "Maybank Islamic" },
      { value: "MBSB", label: "MBSB" },
      { value: "Mizuho", label: "Mizuho" },
      { value: "MUFG", label: "MUFG" },
      { value: "OCBC", label: "OCBC" },
      { value: "OCBC Al-Amin", label: "OCBC Al-Amin" },
      { value: "Public Bank", label: "Public Bank" },
      { value: "Public Bank Islamic", label: "Public Bank Islamic" },
      { value: "RHB", label: "RHB" },
      { value: "RHB Islamic", label: "RHB Islamic" },
      { value: "SMBC", label: "SMBC" },
      { value: "Standard Chartered", label: "Standard Chartered" },
      {
        value: "Standard Chartered Saadiq",
        label: "Standard Chartered Saadiq",
      },
      { value: "UOB", label: "UOB" },
    ],
  },
  {
    group: "eWallets",
    items: [
      { value: "BigPay", label: "BigPay" },
      { value: "Boost", label: "Boost" },
      { value: "Boost Bank", label: "Boost Bank" },
      { value: "Fasspay", label: "Fasspay" },
      { value: "Finexus", label: "Finexus" },
      { value: "GrabPay", label: "GrabPay" },
      { value: "MCash", label: "MCash" },
      { value: "Merchantrade", label: "Merchantrade" },
      { value: "Setel", label: "Setel" },
      { value: "Shopee Pay", label: "Shopee Pay" },
      { value: "TnG E-Wallet", label: "TnG E-Wallet" },
      { value: "WannaPay", label: "WannaPay" },
    ],
  },
];

/** Flat list of all valid DuitNow institution names */
export const DUITNOW_INSTITUTION_VALUES: string[] =
  DUITNOW_INSTITUTIONS.flatMap((group) => group.items.map((i) => i.value));

function isValidNricDate(yymmdd: string): boolean {
  const mm = Number.parseInt(yymmdd.slice(2, 4), 10);
  const dd = Number.parseInt(yymmdd.slice(4, 6), 10);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

export function validateDuitNowId(value: string): string | null {
  if (!value) return "DuitNow ID is required";
  const cleaned = value.replace(/[-\s]/g, "");
  if (MY_PHONE_REGEX.test(cleaned)) return null;
  if (MY_NRIC_REGEX.test(cleaned) && isValidNricDate(cleaned)) return null;
  return "Must be a valid Malaysian phone number (e.g. 0123456789) or NRIC (12 digits)";
}

export function validateRobuxUsername(value: string): string | null {
  if (!value) return "Roblox username is required";
  if (!ROBUX_USERNAME_REGEX.test(value))
    return "Must be 3-20 characters, letters, numbers, and underscores only";
  return null;
}

export function validateBankAccountNumber(value: string): string | null {
  if (!value) return "Account number is required";
  if (!BANK_ACCOUNT_NUMBER_REGEX.test(value)) return "Must be 5-20 digits only";
  return null;
}

export function validateBankAccountName(value: string): string | null {
  if (!value || value.trim().length < 2)
    return "Account holder name must be at least 2 characters";
  return null;
}

export function validateBankName(value: string): string | null {
  if (!value || value.trim().length < 2)
    return "Bank name must be at least 2 characters";
  return null;
}

export function validateDuitNowBankName(value: string): string | null {
  if (!value) return "Please select a bank or eWallet";
  if (!DUITNOW_INSTITUTION_VALUES.includes(value))
    return "Please select a valid DuitNow-participating institution";
  return null;
}

/**
 * Shared Zod superRefine for payment fields.
 * Works with both FormData-based (settings) and JSON-based (onboarding) schemas.
 */
export function paymentSuperRefine(
  data: {
    paymentMethod: string;
    paypalEmail?: string | null;
    robuxUsername?: string | null;
    duitNowId?: string | null;
    duitNowType?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankAccountName?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  const { paymentMethod } = data;

  if (paymentMethod === "PAYPAL") {
    if (!data.paypalEmail) {
      ctx.addIssue({
        code: "custom",
        message: "PayPal email is required",
        path: ["paypalEmail"],
      });
    }
  }

  if (paymentMethod === "ROBUX") {
    const err = validateRobuxUsername(data.robuxUsername || "");
    if (err) {
      ctx.addIssue({ code: "custom", message: err, path: ["robuxUsername"] });
    }
  }

  if (paymentMethod === "DUITNOW") {
    // Determine mode: explicit duitNowType field, or infer from populated fields
    const isIdMode =
      data.duitNowType === "ID" ||
      (!data.duitNowType && data.duitNowId && !data.bankAccountNumber);
    const isBankMode =
      data.duitNowType === "BANK" ||
      (!data.duitNowType && !isIdMode && data.bankAccountNumber);

    if (isIdMode) {
      const err = validateDuitNowId(data.duitNowId || "");
      if (err) {
        ctx.addIssue({ code: "custom", message: err, path: ["duitNowId"] });
      }
    } else if (isBankMode) {
      const bankNameErr = validateDuitNowBankName(data.bankName || "");
      if (bankNameErr) {
        ctx.addIssue({
          code: "custom",
          message: bankNameErr,
          path: ["bankName"],
        });
      }
      const acctNumErr = validateBankAccountNumber(
        data.bankAccountNumber || "",
      );
      if (acctNumErr) {
        ctx.addIssue({
          code: "custom",
          message: acctNumErr,
          path: ["bankAccountNumber"],
        });
      }
      const acctNameErr = validateBankAccountName(data.bankAccountName || "");
      if (acctNameErr) {
        ctx.addIssue({
          code: "custom",
          message: acctNameErr,
          path: ["bankAccountName"],
        });
      }
    } else {
      // Neither mode detected — require at least one
      ctx.addIssue({
        code: "custom",
        message: "Please provide a DuitNow ID or bank account details",
        path: ["duitNowId"],
      });
    }
  }

  if (paymentMethod === "BANK_TRANSFER") {
    const bankNameErr = validateBankName(data.bankName || "");
    if (bankNameErr) {
      ctx.addIssue({
        code: "custom",
        message: bankNameErr,
        path: ["bankName"],
      });
    }
    const acctNumErr = validateBankAccountNumber(data.bankAccountNumber || "");
    if (acctNumErr) {
      ctx.addIssue({
        code: "custom",
        message: acctNumErr,
        path: ["bankAccountNumber"],
      });
    }
    const acctNameErr = validateBankAccountName(data.bankAccountName || "");
    if (acctNameErr) {
      ctx.addIssue({
        code: "custom",
        message: acctNameErr,
        path: ["bankAccountName"],
      });
    }
  }
}
