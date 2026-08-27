/**
 * The one place DuitNow proxy details are turned into a database write.
 *
 * Both payment-details write paths — updateProfileSettings and
 * completeOnboarding — used to hand-roll their own `data:` literal. Two copies
 * of a money-critical write is how they drift, and it is why onboarding still
 * carries a `duitNowType` field that its own client never sends.
 *
 * The rule this exists to enforce: **a recorded check must not outlive the
 * value it checked.** Without it, a developer registers ID A, an admin looks it
 * up in the bank and marks it RESOLVED, the developer then edits to ID B — and
 * the admin's payout card still shows RESOLVED for a value the bank has never
 * seen. That is worse than showing nothing, because it is a green light on the
 * surface where money is released.
 *
 * "The value" is the whole identity — type, number, issuing country and, once
 * one is on record, the institution it is claimed to be linked at. See
 * sameDuitNowIdentity for the one asymmetry.
 */

import type { DuitNowIdIssue, DuitNowIdStatus } from "@prisma/client";
import {
  type DuitNowIdentity,
  type DuitNowIdType,
  normalizeDuitNowId,
  normalizeMalaysianPhone,
  sameDuitNowIdentity,
} from "@/lib/duitnow-id";

/** What is currently stored, as far as the status is concerned. */
export type DuitNowStored = DuitNowIdentity;

/**
 * Prisma update/create data. The status fields are `undefined` — not null —
 * when the identifier did not change, so an existing lookup result survives an
 * unrelated edit like a shipping address.
 */
export type DuitNowWriteData = DuitNowIdentity & {
  duitNowIdStatus?: DuitNowIdStatus;
  duitNowIdCheckedAt?: Date | null;
  duitNowIdIssue?: DuitNowIdIssue | null;
};

export type DuitNowWriteInput = {
  duitNowId?: string | null;
  duitNowIdType?: DuitNowIdType | null;
  /** ISO 3166-1 alpha-2. Kept only on a PASSPORT; dropped for anything else. */
  duitNowIdCountry?: string | null;
  /** BIC of where the developer says it is linked. Dropped with the proxy. */
  duitNowIdInstitution?: string | null;
  /**
   * The developer ticked the "I have linked this" checklist for this exact
   * value. Anything else is UNCONFIRMED — including a value that merely passes
   * format validation, which proves nothing about registration.
   */
  confirmed?: boolean;
};

export function buildDuitNowWrite(
  next: DuitNowWriteInput,
  current: DuitNowStored | null,
  now: Date = new Date(),
): DuitNowWriteData {
  const rawId = next.duitNowId?.trim() || null;
  const type = next.duitNowIdType ?? null;

  // With a type, normalization is per-type: the phone normalizer strips the
  // hyphen out of a business registration number and rewrites a 10-digit
  // army/police number beginning "0" into a phone number. Without one, the
  // value can only have come from the legacy mobile-or-NRIC validator, where
  // the phone normalizer is the correct and expected behaviour (an NRIC is 12
  // digits and cannot match its 10-or-11-digit local-format pattern).
  const duitNowId = rawId
    ? type
      ? normalizeDuitNowId(type, rawId)
      : normalizeMalaysianPhone(rawId)
    : null;

  // A country only means anything on a passport, and an institution only while
  // there is a proxy for it to be linked at. Anything else is a leftover from
  // a previous type or branch, and storing it would put an issuing country on
  // an NRIC or a "linked at" claim on a bank-account payout.
  const duitNowIdCountry =
    duitNowId && type === "PASSPORT"
      ? next.duitNowIdCountry?.trim().toUpperCase() || null
      : null;
  const duitNowIdInstitution = duitNowId
    ? next.duitNowIdInstitution?.trim() || null
    : null;

  const identity: DuitNowIdentity = {
    duitNowId,
    duitNowIdType: type,
    duitNowIdCountry,
    duitNowIdInstitution,
  };

  const unchanged = current !== null && sameDuitNowIdentity(current, identity);

  if (unchanged && !next.confirmed) {
    return identity;
  }

  return {
    ...identity,
    duitNowIdStatus: next.confirmed ? "CONFIRMED" : "UNCONFIRMED",
    duitNowIdCheckedAt: next.confirmed ? now : null,
    duitNowIdIssue: null,
  };
}
