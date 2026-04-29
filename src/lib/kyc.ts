import prisma from "@/lib/prisma";

// Re-export pure utility from payment-validation (safe for client components)
export {
  requiresKycForAutoPayout,
  XENDIT_EWALLET_CODES,
} from "@/lib/payment-validation";

/** How long before unreviewed KYC submissions auto-expire */
export const KYC_DOCUMENT_EXPIRY_DAYS = 7;

/** Hours after decision before documents are deleted */
export const KYC_CLEANUP_HOURS = 48;

/** Max file size per uploaded document (10 MB) */
export const KYC_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Max KYC submissions per user per 24 hours */
export const KYC_RATE_LIMIT = 3;

/** Accepted document types */
export const KYC_DOCUMENT_TYPES = ["mykad", "passport", "driving_licence"];

/**
 * Get the latest KYC verification status for a user.
 * Returns the status string or null if never submitted.
 */
export async function getUserKycStatus(userId: string): Promise<{
  status: string;
  rejectionReason: string | null;
} | null> {
  const verification = await prisma.kycVerification.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    select: { status: true, rejectionReason: true },
  });
  return verification;
}

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

/**
 * Detect MIME type from file magic bytes.
 * Returns null if the file type is not recognized.
 */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}
