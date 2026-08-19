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
 */

import type { DuitNowIdIssue, DuitNowIdStatus } from "@prisma/client";
import {
  type DuitNowIdType,
  normalizeDuitNowId,
  normalizeMalaysianPhone,
} from "@/lib/duitnow-id";

/** What is currently stored, as far as the status is concerned. */
export type DuitNowStored = {
  duitNowId: string | null;
  duitNowIdType: DuitNowIdType | null;
};

/**
 * Prisma update/create data. The status fields are `undefined` — not null —
 * when the identifier did not change, so an existing lookup result survives an
 * unrelated edit like a shipping address.
 */
export type DuitNowWriteData = {
  duitNowId: string | null;
  duitNowIdType: DuitNowIdType | null;
  duitNowIdStatus?: DuitNowIdStatus;
  duitNowIdCheckedAt?: Date | null;
  duitNowIdIssue?: DuitNowIdIssue | null;
};

export type DuitNowWriteInput = {
  duitNowId?: string | null;
  duitNowIdType?: DuitNowIdType | null;
  /**
   * The developer ticked the "I have registered this" checklist for this exact
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

  const unchanged =
    current !== null &&
    current.duitNowId === duitNowId &&
    current.duitNowIdType === type;

  if (unchanged && !next.confirmed) {
    return { duitNowId, duitNowIdType: type };
  }

  return {
    duitNowId,
    duitNowIdType: type,
    duitNowIdStatus: next.confirmed ? "CONFIRMED" : "UNCONFIRMED",
    duitNowIdCheckedAt: next.confirmed ? now : null,
    duitNowIdIssue: null,
  };
}
