/**
 * The pure half of the DuitNow payment-details form: what counts as an error,
 * which branch opens, when the linked-account confirmation is required, and
 * what a field change does to a confirmation already given.
 *
 * Kept out of the component so both hosts — HR Settings and onboarding — and
 * the tests all run the same rules. The component is only the rendering.
 */

import {
  checkDuitNowId,
  checkDuitNowIdCountry,
  type DuitNowIdType,
  normalizeDuitNowId,
  sameDuitNowIdentity,
} from "@/lib/duitnow-id";
import {
  validateBankAccountName,
  validateBankAccountNumber,
  validateDuitNowBankName,
  validateDuitNowInstitution,
} from "@/lib/payment-validation";

export type DuitNowMode = "ID" | "BANK";

export type DuitNowValue = {
  mode: DuitNowMode;
  idType: DuitNowIdType | null;
  /** ISO 3166-1 alpha-2 of the passport's issuing country. PASSPORT only. */
  idCountry: string | null;
  duitNowId: string;
  /** BIC of the bank or e-wallet the developer says the ID is linked at. */
  idInstitution: string | null;
  /** "I've linked this ID to my <app> account as a DuitNow ID." */
  linked: boolean;
  /** "That account is in my own name." */
  ownName: boolean;
  bankName: string | null;
  bankAccountNumber: string;
  bankAccountName: string;
};

export type DuitNowFieldName =
  | "duitNowIdType"
  | "duitNowIdCountry"
  | "duitNowId"
  | "duitNowIdInstitution"
  | "duitNowLinked"
  | "duitNowOwnName"
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName";

/** Every field, for the hosts' "reveal every held-back error on submit" step. */
export const DUITNOW_FIELD_NAMES: readonly DuitNowFieldName[] = [
  "duitNowIdType",
  "duitNowIdCountry",
  "duitNowId",
  "duitNowIdInstitution",
  "duitNowLinked",
  "duitNowOwnName",
  "bankName",
  "bankAccountNumber",
  "bankAccountName",
];

export const DUITNOW_LINKED_MESSAGE =
  "Tick this once it's linked — or the payout waits.";
export const DUITNOW_OWN_NAME_MESSAGE =
  "We can only pay an account in your own name.";

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

/**
 * One pass over the draft; every inline error reads from this map.
 *
 * `attest` is whether the two confirmation boxes are required for this value
 * — see needsDuitNowConfirmation. The host decides, because only it knows
 * what is stored; onboarding has nothing stored and always asks.
 */
export function duitNowFieldErrors(
  value: DuitNowValue,
  { attest }: { attest: boolean } = { attest: true },
): Partial<Record<DuitNowFieldName, string>> {
  const errors: Partial<Record<DuitNowFieldName, string>> = {};

  if (value.mode === "ID") {
    if (!value.idType) {
      errors.duitNowIdType = "Choose which kind of DuitNow ID this is.";
      return errors;
    }
    // Screen order: the bank asks for the issuing country before the number.
    const country = checkDuitNowIdCountry(value.idType, value.idCountry);
    if (country) errors.duitNowIdCountry = country;
    const rejection = checkDuitNowId(value.idType, value.duitNowId);
    if (rejection) errors.duitNowId = rejection.message;
    const institution = validateDuitNowInstitution(value.idInstitution || "");
    if (institution) errors.duitNowIdInstitution = institution;
    if (attest) {
      if (!value.linked) errors.duitNowLinked = DUITNOW_LINKED_MESSAGE;
      if (!value.ownName) errors.duitNowOwnName = DUITNOW_OWN_NAME_MESSAGE;
    }
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

/** What the form needs to know about the stored row to decide whether to ask. */
export type DuitNowStoredView = {
  duitNowId: string | null;
  duitNowIdType: string | null;
  duitNowIdCountry?: string | null;
  duitNowIdInstitution?: string | null;
  duitNowIdStatus?: string | null;
};

/**
 * Whether saving this needs the linked-account confirmation.
 *
 * Only proxy IDs, and only when this exact identity has not already been
 * confirmed — re-asking on every save is how a confirmation becomes a reflex
 * click. It is asked when nothing is stored (onboarding), when the identity
 * changed (sameDuitNowIdentity — a legacy row naming its institution for the
 * first time does not count), when the stored value is still UNCONFIRMED
 * (how the backfill's rows get collected), and when the bank could not reach
 * it — the banner tells the developer to fix it and save again, and saving
 * again has to actually re-ask.
 */
export function needsDuitNowConfirmation(
  value: DuitNowValue,
  stored: DuitNowStoredView | null,
): boolean {
  if (value.mode !== "ID" || !value.idType) return false;
  if (!stored) return true;
  const unchanged = sameDuitNowIdentity(
    {
      duitNowId: stored.duitNowId,
      duitNowIdType: stored.duitNowIdType as DuitNowIdType | null,
      duitNowIdCountry: stored.duitNowIdCountry ?? null,
      duitNowIdInstitution: stored.duitNowIdInstitution ?? null,
    },
    {
      duitNowId: normalizeDuitNowId(value.idType, value.duitNowId),
      duitNowIdType: value.idType,
      duitNowIdCountry: value.idType === "PASSPORT" ? value.idCountry : null,
      duitNowIdInstitution: value.idInstitution,
    },
  );
  const status = stored.duitNowIdStatus ?? "UNCONFIRMED";
  return !unchanged || status === "UNCONFIRMED" || status === "UNREACHABLE";
}

/** The keys that make the value a different proxy from the one confirmed. */
const IDENTITY_KEYS = [
  "mode",
  "idType",
  "duitNowId",
  "idCountry",
  "idInstitution",
] as const;

/**
 * How a field change lands on the draft. A confirmation is about one exact
 * proxy, so touching any part of the identity un-ticks both boxes — a box
 * ticked for A must not carry over to B. Toggling a box changes nothing
 * else. A country only belongs to a passport, so it goes when the type does.
 */
export function applyDuitNowPatch(
  prev: DuitNowValue,
  patch: Partial<DuitNowValue>,
): DuitNowValue {
  const next: DuitNowValue = { ...prev, ...patch };
  const identityChanged = IDENTITY_KEYS.some(
    (key) => key in patch && patch[key] !== prev[key],
  );
  if (next.idType !== "PASSPORT") next.idCountry = null;
  if (identityChanged) {
    next.linked = false;
    next.ownName = false;
  }
  return next;
}
