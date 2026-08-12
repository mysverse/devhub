import { NextResponse } from "next/server";
import { deleteKycDocuments } from "@/lib/blob-storage";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { createKycAuditEntry, KYC_CLEANUP_HOURS } from "@/lib/kyc";
import prisma from "@/lib/prisma";

/**
 * KYC document cleanup cron job.
 * - Auto-expires unreviewed PENDING submissions past their expiresAt date
 * - Deletes document blobs 48h after a decision (APPROVED/REJECTED)
 * - Deletes document blobs immediately for EXPIRED submissions
 *
 * Runs every 6 hours via Vercel Cron.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let expiredCount = 0;
  let cleanedCount = 0;

  // 1. Auto-expire unreviewed PENDING submissions past expiresAt
  const expiredResults = await prisma.kycVerification.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true, userId: true },
  });

  for (const v of expiredResults) {
    await prisma.kycVerification.update({
      where: { id: v.id },
      data: { status: "EXPIRED" },
    });
    await createKycAuditEntry(v.id, "system", "EXPIRED");
    expiredCount++;
  }

  // 2. Delete documents for decided verifications (48h after decision)
  const cleanupCutoff = new Date(
    now.getTime() - KYC_CLEANUP_HOURS * 60 * 60 * 1000,
  );

  const toClean = await prisma.kycVerification.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED"] },
      reviewedAt: { lt: cleanupCutoff },
      documentsDeletedAt: null,
      OR: [
        { idDocumentBlobUrl: { not: null } },
        { selfieBlobUrl: { not: null } },
      ],
    },
  });

  for (const v of toClean) {
    const urls = [v.idDocumentBlobUrl, v.selfieBlobUrl].filter(
      Boolean,
    ) as string[];

    if (urls.length > 0) {
      try {
        await deleteKycDocuments(urls);
      } catch (err) {
        console.error(
          `[kyc-cleanup] Failed to delete blobs for verification ${v.id}:`,
          err,
        );
        continue;
      }
    }

    await prisma.kycVerification.update({
      where: { id: v.id },
      data: {
        idDocumentBlobUrl: null,
        selfieBlobUrl: null,
        documentsDeletedAt: now,
      },
    });

    await createKycAuditEntry(v.id, "system", "DOCUMENTS_DELETED");
    cleanedCount++;
  }

  // 3. Delete documents for EXPIRED submissions immediately
  const expiredToClean = await prisma.kycVerification.findMany({
    where: {
      status: "EXPIRED",
      documentsDeletedAt: null,
      OR: [
        { idDocumentBlobUrl: { not: null } },
        { selfieBlobUrl: { not: null } },
      ],
    },
  });

  for (const v of expiredToClean) {
    const urls = [v.idDocumentBlobUrl, v.selfieBlobUrl].filter(
      Boolean,
    ) as string[];

    if (urls.length > 0) {
      try {
        await deleteKycDocuments(urls);
      } catch (err) {
        console.error(
          `[kyc-cleanup] Failed to delete blobs for expired verification ${v.id}:`,
          err,
        );
        continue;
      }
    }

    await prisma.kycVerification.update({
      where: { id: v.id },
      data: {
        idDocumentBlobUrl: null,
        selfieBlobUrl: null,
        documentsDeletedAt: now,
      },
    });

    await createKycAuditEntry(v.id, "system", "DOCUMENTS_DELETED");
    cleanedCount++;
  }

  console.log(
    `[kyc-cleanup] Expired: ${expiredCount}, Documents cleaned: ${cleanedCount}`,
  );

  return NextResponse.json({
    expired: expiredCount,
    cleaned: cleanedCount,
  });
}
