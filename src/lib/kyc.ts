/**
 * KYC records that already exist: review, audit and retention.
 *
 * Collection was retired when the Xendit integration was removed — the
 * published AML/KYC policy scoped identity verification entirely to
 * "automated eWallet payouts" required by that payment partner, so with the
 * partner gone the basis for asking lapsed. What remains serves the promise
 * the policy makes about data already held: results and the reviewer audit
 * log are retained, and documents are purged on schedule by the
 * kyc-cleanup cron.
 */

import prisma from "@/lib/prisma";

// Re-export pure utility from payment-validation (safe for client components)
export {
  requiresKycForAutoPayout,
  XENDIT_EWALLET_CODES,
} from "@/lib/payment-validation";

/** Hours after decision before documents are deleted */
export const KYC_CLEANUP_HOURS = 48;

/**
 * Check if the user has an approved KYC verification.
 */
export async function isKycApproved(userId: string): Promise<boolean> {
  const count = await prisma.kycVerification.count({
    where: { userId, status: "APPROVED" },
  });
  return count > 0;
}

/**
 * Create a KYC audit log entry.
 */
export async function createKycAuditEntry(
  verificationId: string,
  actorId: string,
  action: string,
  details?: string,
): Promise<void> {
  await prisma.kycAuditLog.create({
    data: {
      verificationId,
      actorId,
      action,
      details,
    },
  });
}
