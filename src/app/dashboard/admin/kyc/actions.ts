"use server";

import { revalidatePath } from "next/cache";
import KycApproved from "@/emails/KycApproved";
import KycRejected from "@/emails/KycRejected";
import { getSession } from "@/lib/auth-utils";
import { sendEmail } from "@/lib/email";
import { createKycAuditEntry } from "@/lib/kyc";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const { userId } = await getSession();
  if (!userId) throw new Error("Unauthorized");

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userProfile || userProfile.role !== "ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }

  return userId;
}

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
    if (email) {
      await sendEmail({
        to: email,
        subject: "Identity Verified — Automatic Payouts Available",
        react: KycApproved({ userName: name }),
      });
    }
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
    if (email) {
      await sendEmail({
        to: email,
        subject: "Identity Verification — Action Required",
        react: KycRejected({ userName: name, reason: reason.trim() }),
      });
    }
  } catch (err) {
    console.error("[kyc] Failed to send rejection email:", err);
  }

  revalidatePath("/dashboard/admin/kyc");
  return { success: true };
}
