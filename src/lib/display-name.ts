import type { Prisma } from "@prisma/client";

/**
 * Resolves the name DevHub shows to humans.
 *
 * `UserProfile.legalName` is collected under an explicit promise — repeated in
 * onboarding, settings and the LegalNameReminder email — that it is only ever
 * seen by administrators, for payment and compliance. Every UI label, email
 * greeting, notification body and Linear comment must therefore go through this
 * resolver instead of reaching for the profile's name fields directly.
 *
 * Deliberately dependency-free apart from a type-only Prisma import, so client
 * components can call it too.
 */

export const DEFAULT_DISPLAY_NAME = "Developer";

/**
 * A DevHub profile. Note the absent `legalName` and `email` fields: passing
 * either is a type error rather than a policy question a reviewer has to catch.
 */
export type DisplayNameProfile = {
  preferredName?: string | null;
  user?: { name?: string | null } | null;
};

/**
 * A Linear identity. Structurally satisfied by `LinearAssigneeDTO`
 * (src/lib/linear-queries.ts) and by the assignee shapes in ppt-eligibility,
 * ppt-assignment-watch and bonus, so no adapter is needed at call sites.
 */
export type DisplayNameLinearIdentity = {
  displayName?: string | null;
  name?: string | null;
};

export type DisplayNameInput = {
  profile?: DisplayNameProfile | null;
  linear?: DisplayNameLinearIdentity | null;
  /**
   * A Linear name already denormalized onto a DevHub row —
   * PptAssignmentWatch.assigneeName, PptPayoutState.assigneeName,
   * BonusCandidate.assigneeName. Always Linear-sourced, never a legal name.
   */
  storedLinearName?: string | null;
  /** Overrides "Developer" — e.g. "developer" mid-sentence, "a developer". */
  fallback?: string;
};

function firstNonBlank(
  candidates: (string | null | undefined)[],
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Preferred name, then the OAuth handle, then whatever Linear knows. A DevHub
 * identity outranks a workspace handle because the developer chose it here.
 */
function candidatesFor(input: DisplayNameInput) {
  return [
    input.profile?.preferredName,
    input.profile?.user?.name,
    input.linear?.displayName,
    input.linear?.name,
    input.storedLinearName,
  ];
}

export function resolveDisplayName(input: DisplayNameInput): string {
  return (
    firstNonBlank(candidatesFor(input)) ??
    input.fallback ??
    DEFAULT_DISPLAY_NAME
  );
}

/** As above, but yields null instead of a fallback — for nullable DTO fields. */
export function resolveDisplayNameOrNull(
  input: DisplayNameInput,
): string | null {
  return firstNonBlank(candidatesFor(input));
}

/** Spread into a `userProfile` select. `include:` queries get these already. */
export const DISPLAY_NAME_SELECT = {
  preferredName: true,
  user: { select: { name: true } },
} as const satisfies Prisma.UserProfileSelect;
