/**
 * Named Prisma selects, so narrowing is a decision made once rather than a
 * literal copy-pasted into every query.
 *
 * The point is not that any current query leaks — most are hand-narrowed
 * before they reach a client. It is that a sensitive column added to
 * UserProfile next year should not automatically ship to a browser because
 * some query used `include:` and someone spread the row into a DTO.
 */
import type { Prisma } from "@prisma/client";
import type { DisplayNameProfile } from "@/lib/display-name";

/** better-auth User fields the notification and email paths need. */
export const USER_IDENTITY_SELECT = {
  name: true,
  email: true,
} as const satisfies Prisma.UserSelect;

/** Drop-in for the hand-copied `{ user: { select: { name, email } } }`. */
export const PROFILE_CONTACT_INCLUDE = {
  user: { select: USER_IDENTITY_SELECT },
} as const satisfies Prisma.UserProfileInclude;

/** Exactly what resolveDisplayName() reads, and nothing else. */
export const PROFILE_DISPLAY_SELECT = {
  id: true,
  preferredName: true,
  user: { select: { name: true } },
} as const satisfies Prisma.UserProfileSelect;

/** Payment rails. Only for server code that actually pays someone. */
export const PROFILE_PAYOUT_SELECT = {
  paymentMethod: true,
  paypalEmail: true,
  duitNowId: true,
  // The type is as load-bearing as the value: the bank asks which kind of
  // proxy this is before it asks for the digits, and the digits cannot say.
  duitNowIdType: true,
  duitNowIdStatus: true,
  duitNowIdCheckedAt: true,
  duitNowIdIssue: true,
  bankName: true,
  bankAccountNumber: true,
  bankAccountName: true,
  robloxId: true,
  robuxUsername: true,
} as const satisfies Prisma.UserProfileSelect;

/**
 * Compile-time link between the preset and the resolver. If someone drops
 * preferredName from PROFILE_DISPLAY_SELECT, resolveDisplayName() would keep
 * type-checking and silently fall back to the OAuth name at runtime — this
 * turns that into a `pnpm typecheck` failure with a clear location.
 */
type _DisplayPresetSatisfiesResolver =
  Prisma.UserProfileGetPayload<{
    select: typeof PROFILE_DISPLAY_SELECT;
  }> extends DisplayNameProfile
    ? true
    : never;
const _assertDisplayPreset: _DisplayPresetSatisfiesResolver = true;
void _assertDisplayPreset;

/**
 * The payout fields a developer-facing surface may read.
 *
 * Encodes a policy rather than a shape: `providerData` holds the raw provider
 * request and response — bank codes, account numbers, the full FinSys reply —
 * and `include: { payout: true }` shipped all of it into the RSC payload of a
 * page any developer can open. It is also the single heaviest column on the
 * heaviest developer-facing read.
 *
 * This is the one select preset worth sharing. Presets for page *shapes* are
 * a trap — two pages that look alike diverge for product reasons and coupling
 * them means the next feature on one silently re-widens the other.
 */
export const PAYOUT_STATUS_SELECT = {
  id: true,
  provider: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  completedAt: true,
} as const satisfies Prisma.PayoutSelect;
