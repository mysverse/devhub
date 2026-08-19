/**
 * The pure half of the DuitNow payment-details form: what counts as an error,
 * which branch opens, and when the registration confirmation is required.
 *
 * Kept out of the component so both hosts — HR Settings and onboarding — and
 * the tests all run the same rules. The component is only the rendering.
 */

import {
  checkDuitNowId,
  type DuitNowIdType,
  normalizeDuitNowId,
} from "@/lib/duitnow-id";
import {
  validateBankAccountName,
  validateBankAccountNumber,
  validateDuitNowBankName,
} from "@/lib/payment-validation";

export type DuitNowMode = "ID" | "BANK";

export type DuitNowValue = {
  mode: DuitNowMode;
  idType: DuitNowIdType | null;
  duitNowId: string;
  bankName: string | null;
  bankAccountNumber: string;
  bankAccountName: string;
};

export type DuitNowFieldName =
  | "duitNowIdType"
  | "duitNowId"
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName";

/**
 * The stored branch, derived from data and never hard-defaulted.
 *
 * Presenting Bank account first must not become preselecting it. The settings
 * action writes every payment column unconditionally and only the rendered
 * branch has inputs, so opening an existing proxy user on the bank branch
 * would null their duitNowId the next time they saved anything at all — and
 * the bank validators would refuse the submit before that, locking them out of
 * editing their own legal name.
 */
export function initialDuitNowMode(profile: {
  duitNowId: string | null;
  bankAccountNumber: string | null;
}): DuitNowMode {
  // Bank details win when a developer has both, matching classifyPayoutRoute,
  // which checks the bank triple before the proxy. Only the rendered branch
  // has inputs, so opening on the proxy instead would clear the bank triple on
  // the next save and silently drop an auto-payable developer onto the manual
  // path — while the admin card kept showing the proxy it no longer pays.
  if (profile.bankAccountNumber) return "BANK";
  if (profile.duitNowId) return "ID";
  return "BANK";
}

/** One pass over the draft; every inline error reads from this map. */
export function duitNowFieldErrors(
  value: DuitNowValue,
): Partial<Record<DuitNowFieldName, string>> {
  const errors: Partial<Record<DuitNowFieldName, string>> = {};

  if (value.mode === "ID") {
    if (!value.idType) {
      errors.duitNowIdType = "Choose which kind of DuitNow ID this is.";
      return errors;
    }
    const rejection = checkDuitNowId(value.idType, value.duitNowId);
    if (rejection) errors.duitNowId = rejection.message;
    return errors;
  }

  const bankName = validateDuitNowBankName(value.bankName || "");
  if (bankName) errors.bankName = bankName;
  const accountNumber = validateBankAccountNumber(value.bankAccountNumber);
  if (accountNumber) errors.bankAccountNumber = accountNumber;
  const accountName = validateBankAccountName(value.bankAccountName);
  if (accountName) errors.bankAccountName = accountName;
  return errors;
}

/**
 * Whether saving this needs the registration confirmation.
 *
 * Only proxy IDs, and only when this exact value has not already been
 * confirmed — re-asking on every save is how a confirmation becomes a reflex
 * click. A stored value still sitting at UNCONFIRMED is asked about once,
 * which is how existing rows get collected after the backfill.
 */
export function needsDuitNowConfirmation(
  value: DuitNowValue,
  stored: {
    duitNowId: string | null;
    duitNowIdType: string | null;
    duitNowIdStatus?: string | null;
  },
): boolean {
  if (value.mode !== "ID" || !value.idType) return false;
  const normalized = normalizeDuitNowId(value.idType, value.duitNowId);
  const unchanged =
    stored.duitNowId === normalized && stored.duitNowIdType === value.idType;
  return !(unchanged && stored.duitNowIdStatus !== "UNCONFIRMED");
}
