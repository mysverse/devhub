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
/**
 * BIC/SWIFT code → display name mapping for DuitNow-participating institutions.
 * Codes sourced from PayNet's official DuitNow participant list.
 */
export const DUITNOW_BANK_MAP: Record<string, string> = {
  // Banks
  ACDBMYK2: "Aeon Bank",
  PHBMMYKL: "Affin Bank",
  AGOBMYKL: "Agro Bank",
  RJHIMYKL: "Al Rajhi Bank",
  MFBBMYKL: "Alliance Bank",
  ARBKMYKL: "AmBank",
  BIMBMYKL: "Bank Islam",
  BOFAMY2X: "Bank of America",
  BKCHMYKL: "Bank of China",
  BMMBMYKL: "Bank Muamalat",
  BKRMMYKL: "Bank Rakyat",
  BNPAMYKL: "BNP Paribas",
  BOBEMYK2: "Boost Bank",
  BSNAMYK1: "BSN",
  PCBCMYKL: "China Construction Bank",
  CIBBMYKL: "CIMB",
  CITIMYKL: "Citibank",
  DEUTMYKL: "Deutsche Bank",
  GXSPMYKL: "GXBank",
  HLBBMYKL: "Hong Leong Bank",
  HBMBMYKL: "HSBC",
  ICBKMYKL: "ICBC",
  CHASMYKX: "JP Morgan",
  KAFBMYK2: "KAF Digital Bank",
  KFHOMYKL: "Kuwait Finance House",
  MBBEMYKL: "Maybank",
  AFBQMYKL: "MBSB",
  MHCBMYKA: "Mizuho",
  BOTKMYKX: "MUFG",
  OCBCMYKL: "OCBC",
  PBBEMYKL: "Public Bank",
  RHBBMYKL: "RHB",
  SCCHMYKL: "RYT Bank",
  SMBCMYKL: "SMBC",
  SCBLMYKX: "Standard Chartered",
  UOVBMYKL: "UOB",
  // eWallets
  BGPYMYNB: "BigPay",
  BOSTMYNB: "Boost",
  FSPYMYNB: "Fasspay",
  FNXSMYNB: "Finexus",
  MASBMYNB: "Merchantrade",
  SVSBMYNB: "Setel",
  ARPYMYNB: "ShopeePay",
  TNGDMYNB: "TnG E-Wallet",
};

/** Mantine Select-compatible grouped data (value = BIC code, label = display name) */
export const DUITNOW_INSTITUTIONS: {
  group: string;
  items: { value: string; label: string }[];
}[] = [
  {
    group: "Banks",
    items: [
      { value: "ACDBMYK2", label: "Aeon Bank" },
      { value: "PHBMMYKL", label: "Affin Bank" },
      { value: "AGOBMYKL", label: "Agro Bank" },
      { value: "RJHIMYKL", label: "Al Rajhi Bank" },
      { value: "MFBBMYKL", label: "Alliance Bank" },
      { value: "ARBKMYKL", label: "AmBank" },
      { value: "BIMBMYKL", label: "Bank Islam" },
      { value: "BOFAMY2X", label: "Bank of America" },
      { value: "BKCHMYKL", label: "Bank of China" },
      { value: "BMMBMYKL", label: "Bank Muamalat" },
      { value: "BKRMMYKL", label: "Bank Rakyat" },
      { value: "BNPAMYKL", label: "BNP Paribas" },
      { value: "BOBEMYK2", label: "Boost Bank" },
      { value: "BSNAMYK1", label: "BSN" },
      { value: "PCBCMYKL", label: "China Construction Bank" },
      { value: "CIBBMYKL", label: "CIMB" },
      { value: "CITIMYKL", label: "Citibank" },
      { value: "DEUTMYKL", label: "Deutsche Bank" },
      { value: "GXSPMYKL", label: "GXBank" },
      { value: "HLBBMYKL", label: "Hong Leong Bank" },
      { value: "HBMBMYKL", label: "HSBC" },
      { value: "ICBKMYKL", label: "ICBC" },
      { value: "CHASMYKX", label: "JP Morgan" },
      { value: "KAFBMYK2", label: "KAF Digital Bank" },
      { value: "KFHOMYKL", label: "Kuwait Finance House" },
      { value: "MBBEMYKL", label: "Maybank" },
      { value: "AFBQMYKL", label: "MBSB" },
      { value: "MHCBMYKA", label: "Mizuho" },
      { value: "BOTKMYKX", label: "MUFG" },
      { value: "OCBCMYKL", label: "OCBC" },
      { value: "PBBEMYKL", label: "Public Bank" },
      { value: "RHBBMYKL", label: "RHB" },
      { value: "SCCHMYKL", label: "RYT Bank" },
      { value: "SMBCMYKL", label: "SMBC" },
      { value: "SCBLMYKX", label: "Standard Chartered" },
      { value: "UOVBMYKL", label: "UOB" },
    ],
  },
  {
    group: "eWallets",
    items: [
      { value: "BGPYMYNB", label: "BigPay" },
      { value: "BOSTMYNB", label: "Boost" },
      { value: "FSPYMYNB", label: "Fasspay" },
      { value: "FNXSMYNB", label: "Finexus" },
      { value: "MASBMYNB", label: "Merchantrade" },
      { value: "SVSBMYNB", label: "Setel" },
      { value: "ARPYMYNB", label: "ShopeePay" },
      { value: "TNGDMYNB", label: "TnG E-Wallet" },
    ],
  },
];

/** Flat list of all valid DuitNow BIC codes */
export const DUITNOW_INSTITUTION_VALUES: string[] =
  Object.keys(DUITNOW_BANK_MAP);

/** Resolve a bank name for display — handles both BIC codes and legacy plain-text names */
export function getBankDisplayName(
  bankName: string | null | undefined,
): string {
  if (!bankName) return "";
  return DUITNOW_BANK_MAP[bankName] ?? bankName;
}

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
