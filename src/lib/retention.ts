/**
 * Data-lifecycle windows. Constants rather than env vars, matching
 * src/lib/kyc.ts — the only other retention control in the codebase — so the
 * policy is reviewable in the diff and .env.mock gains no new surface.
 */

/** Days after delivery before a fulfilled order's shipping PII is purged. */
export const WELCOME_PACK_ADDRESS_RETENTION_DAYS = 90;

/** Days after a CANCELLED/REJECTED order before its shipping PII is purged. */
export const WELCOME_PACK_TERMINAL_RETENTION_DAYS = 30;

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
