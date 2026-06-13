"use server";

import { revalidatePath } from "next/cache";
import KycApproved from "@/emails/KycApproved";
import KycRejected from "@/emails/KycRejected";
import { requireAdmin } from "@/lib/authz";
import { createKycAuditEntry } from "@/lib/kyc";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";

export async function approveKyc(verificationId: string) {
  const adminId = await requireAdmin();

  const verification = await prisma.kycVerification.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  if (!verification) {
    return { error: "Verification not found" };
  }

  if (verification.status !== "PENDING") {
    return { error: "Verification is not pending review" };
  }

  await prisma.kycVerification.update({
    where: { id: verificationId },
    data: {
      status: "APPROVED",
      reviewerId: adminId,
      reviewedAt: new Date(),
    },
  });

  await createKycAuditEntry(verificationId, adminId, "APPROVED");

  // Send approval email
  try {
    const { email, name } = verification.user.user;
    await notify({
      userId: verification.userId,
      actorId: adminId,
      domain: "kyc",
      type: "APPROVED",
      title: "Identity verified",
      message: "Automatic payouts are now available.",
      href: "/dashboard/settings",
      entityType: "kyc_verification",
      entityId: verificationId,
      dedupeKey: `kyc:approved:${verificationId}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: email
        ? {
            to: email,
            subject: "Identity Verified — Automatic Payouts Available",
            category: "kyc_approved",
            idempotencyKey: `kyc:approved:${verificationId}`,
            react: KycApproved({ userName: name }),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[kyc] Failed to send approval email:", err);
  }

  revalidatePath("/dashboard/admin/kyc");
  return { success: true };
}

export async function rejectKyc(verificationId: string, reason: string) {
  const adminId = await requireAdmin();

  if (!reason || reason.trim().length < 2) {
    return { error: "Rejection reason is required" };
  }

  const verification = await prisma.kycVerification.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  if (!verification) {
    return { error: "Verification not found" };
  }

  if (verification.status !== "PENDING") {
    return { error: "Verification is not pending review" };
  }

  await prisma.kycVerification.update({
    where: { id: verificationId },
    data: {
      status: "REJECTED",
      rejectionReason: reason.trim(),
      reviewerId: adminId,
      reviewedAt: new Date(),
    },
  });

  await createKycAuditEntry(verificationId, adminId, "REJECTED", reason.trim());

  // Send rejection email
  try {
    const { email, name } = verification.user.user;
    await notify({
      userId: verification.userId,
      actorId: adminId,
      domain: "kyc",
      type: "REJECTED",
      title: "Identity verification needs attention",
      message: reason.trim(),
      href: "/dashboard/settings",
      entityType: "kyc_verification",
      entityId: verificationId,
      dedupeKey: `kyc:rejected:${verificationId}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: email
        ? {
            to: email,
            subject: "Identity Verification — Action Required",
            category: "kyc_rejected",
            idempotencyKey: `kyc:rejected:${verificationId}`,
            react: KycRejected({ userName: name, reason: reason.trim() }),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[kyc] Failed to send rejection email:", err);
  }

  revalidatePath("/dashboard/admin/kyc");
  return { success: true };
}
