import type { z } from "zod";
import {
  checkDuitNowId,
  isDuitNowIdType,
  isValidNricDate,
  normalizeMalaysianPhone,
} from "@/lib/duitnow-id";

// Re-exported so existing callers keep importing it from here. The single
// implementation lives in duitnow-id.ts alongside the per-type rules.
export { normalizeMalaysianPhone };

// Malaysian phone number with country code: +60 followed by 9-10 digits.
// Deliberately lenient: this is shared with welcome-pack shipping, where a
// landline is a perfectly good courier contact number. DuitNow mobile
// proxies use MY_MOBILE_REGEX in duitnow-id.ts, which excludes landlines.
export const MY_PHONE_REGEX = /^\+60\d{9,10}$/;

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

/**
 * Banks supported by Billplz for automated payouts (Payment Orders).
 * BIC/SWIFT codes sourced from Billplz documentation.
 */
export const BILLPLZ_SUPPORTED_BANKS = new Set([
  "PHBMMYKL", // Affin Bank
  "AGOBMYKL", // Agrobank
  "MFBBMYKL", // Alliance Bank
  "RJHIMYKL", // Al Rajhi Bank
  "ARBKMYKL", // AmBank
  "BIMBMYKL", // Bank Islam
  "BKRMMYKL", // Bank Rakyat
  "BMMBMYKL", // Bank Muamalat
  "BSNAMYK1", // BSN
  "CIBBMYKL", // CIMB
  "CITIMYKL", // Citibank
  "HLBBMYKL", // Hong Leong Bank
  "HBMBMYKL", // HSBC
  "KFHOMYKL", // Kuwait Finance House
  "MBBEMYKL", // Maybank
  "OCBCMYKL", // OCBC
  "PBBEMYKL", // Public Bank
  "RHBBMYKL", // RHB
  "SCBLMYKX", // Standard Chartered
  "UOVBMYKL", // UOB
]);

/**
 * BIC/SWIFT code → Xendit bank code mapping for Malaysian disbursements.
 * Xendit uses its own bank code format for the disbursement API.
 * Codes sourced from Xendit documentation for Malaysia.
 */
export const BIC_TO_XENDIT_BANK_CODE: Record<string, string> = {
  PHBMMYKL: "AFFIN_BANK",
  AGOBMYKL: "AGRO_BANK",
  MFBBMYKL: "ALLIANCE_BANK",
  ARBKMYKL: "AMBANK",
  BIMBMYKL: "BANK_ISLAM",
  BKRMMYKL: "BANK_RAKYAT",
  BMMBMYKL: "BANK_MUAMALAT",
  BSNAMYK1: "BSN",
  CIBBMYKL: "CIMB",
  CITIMYKL: "CITIBANK",
  HLBBMYKL: "HONG_LEONG_BANK",
  HBMBMYKL: "HSBC",
  KFHOMYKL: "KFH",
  MBBEMYKL: "MAYBANK",
  OCBCMYKL: "OCBC",
  PBBEMYKL: "PUBLIC_BANK",
  RHBBMYKL: "RHB",
  SCBLMYKX: "STANDARD_CHARTERED",
  UOVBMYKL: "UOB",
  RJHIMYKL: "AL_RAJHI_BANK",
  ACDBMYK2: "AEON_BANK",
  BOBEMYK2: "BOOST_BANK",
  GXSPMYKL: "GX_BANK",
};

export const XENDIT_SUPPORTED_BANKS = new Set(
  Object.keys(BIC_TO_XENDIT_BANK_CODE),
);

/** Check if a bank code is supported by Xendit for automated disbursements */
export function isXenditSupported(
  bankCode: string | null | undefined,
): boolean {
  if (!bankCode) return false;
  return XENDIT_SUPPORTED_BANKS.has(bankCode);
}

/** Convert a BIC code to its Xendit bank code equivalent, or null if unsupported */
export function getXenditBankCode(bicCode: string): string | null {
  return BIC_TO_XENDIT_BANK_CODE[bicCode] ?? null;
}

/**
 * BIC codes for eWallets that route through Xendit for disbursement
 * and require KYC for automatic payouts.
 * Bank transfers are handled by Billplz only and do not require KYC.
 */
export const XENDIT_EWALLET_CODES = new Set([
  "BGPYMYNB", // BigPay
  "BOSTMYNB", // Boost
  "FSPYMYNB", // Fasspay
  "FNXSMYNB", // Finexus
  "MASBMYNB", // Merchantrade
  "SVSBMYNB", // Setel
  "ARPYMYNB", // ShopeePay
  "TNGDMYNB", // TnG E-Wallet
]);

/**
 * Check if a bank/eWallet code requires KYC for automatic payouts.
 * Returns true for eWallet BIC codes that route through Xendit.
 */
export function requiresKycForAutoPayout(
  bankCode: string | null | undefined,
): boolean {
  if (!bankCode) return false;
  return XENDIT_EWALLET_CODES.has(bankCode);
}

/** Display-friendly payment method labels */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PAYPAL: "PayPal",
  DUITNOW: "DuitNow",
  ROBUX: "Robux",
  BANK_TRANSFER: "International Bank Transfer",
};

/** Get a display-friendly label for a payment method enum value */
export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Check if a bank code is supported by Billplz for automated payouts */
export function isBillplzSupported(
  bankCode: string | null | undefined,
): boolean {
  if (!bankCode) return false;
  return BILLPLZ_SUPPORTED_BANKS.has(bankCode);
}

/** Resolve a bank name for display — handles both BIC codes and legacy plain-text names */
export function getBankDisplayName(
  bankName: string | null | undefined,
): string {
  if (!bankName) return "";
  return DUITNOW_BANK_MAP[bankName] ?? bankName;
}

export function validateDuitNowId(value: string): string | null {
  if (!value) return "DuitNow ID is required";
  const cleaned = value.replace(/[-\s]/g, "");
  // Check if it's a phone number (try normalizing first)
  const normalized = normalizeMalaysianPhone(cleaned);
  if (MY_PHONE_REGEX.test(normalized)) return null;
  // Check if it's an NRIC
  if (MY_NRIC_REGEX.test(cleaned) && isValidNricDate(cleaned)) return null;
  return "Must be a valid Malaysian phone number (e.g. +60123456789) or NRIC (12 digits)";
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
    duitNowId?: string | null;
    /** Which branch of the DuitNow form this is: proxy ID or bank account. */
    duitNowType?: string | null;
    /** Which kind of proxy `duitNowId` is. See duitnow-id.ts. */
    duitNowIdType?: string | null;
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

  // ROBUX payment validation is handled server-side by checking OAuth-linked account

  if (paymentMethod === "DUITNOW") {
    // Determine mode: explicit duitNowType field, or infer from populated fields
    const isIdMode =
      data.duitNowType === "ID" ||
      (!data.duitNowType && data.duitNowId && !data.bankAccountNumber);
    const isBankMode =
      data.duitNowType === "BANK" ||
      (!data.duitNowType && !isIdMode && data.bankAccountNumber);

    if (isIdMode) {
      // With an explicit type, all five DuitNow proxy types are reachable.
      // Without one the submission predates the type field, and the only
      // values it can hold are the mobile-or-NRIC pair the old rule allowed.
      const err = isDuitNowIdType(data.duitNowIdType)
        ? checkDuitNowId(data.duitNowIdType, data.duitNowId || "")?.message
        : validateDuitNowId(data.duitNowId || "");
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
