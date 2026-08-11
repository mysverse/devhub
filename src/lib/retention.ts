/**
 * Data-lifecycle windows. Constants rather than env vars, matching
 * src/lib/kyc.ts — the only other retention control in the codebase — so the
 * policy is reviewable in the diff and .env.mock gains no new surface.
 */

/** Days after delivery before a fulfilled order's shipping PII is purged. */
export const WELCOME_PACK_ADDRESS_RETENTION_DAYS = 90;

/** Days after a CANCELLED/REJECTED order before its shipping PII is purged. */
export const WELCOME_PACK_TERMINAL_RETENTION_DAYS = 30;

/**
 * Hours a PPT comment attachment may sit in UPLOADED before it is discarded.
 * These are uploads whose composer was closed without posting: the bytes are
 * already on Linear but nothing will ever reference them, and the row is the
 * only thing keeping them attributable to a user. Generous enough that a
 * developer can leave a half-written proof open overnight and still find their
 * screenshots there.
 */
export const PPT_ATTACHMENT_UNPOSTED_RETENTION_HOURS = 24;

/**
 * Attachments claimed for a comment that never landed.
 *
 * The claim flips rows UPLOADED -> POSTED before `createComment` returns, so a
 * killed invocation can strand a row as POSTED with a null `postedAt` and no
 * comment — permanently unclaimable, since the compare-and-set only matches
 * UPLOADED. Deliberately far longer than the unposted window: the same shape
 * also occurs when the comment IS live and only the `postedAt` stamp failed,
 * and collecting one of those before an admin has reviewed the payout would
 * delete a real evidence record.
 */
export const PPT_ATTACHMENT_ORPHAN_CLAIM_RETENTION_HOURS = 24 * 7;

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

export function hoursAgo(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}
