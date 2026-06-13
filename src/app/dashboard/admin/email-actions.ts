"use server";

import { revalidatePath } from "next/cache";
import DocumentInvalidated from "@/emails/DocumentInvalidated";
import LegalNameReminder from "@/emails/LegalNameReminder";
import PaymentInfoInvalid from "@/emails/PaymentInfoInvalid";
import { requireAdmin } from "@/lib/authz";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import prisma from "@/lib/prisma";

export async function getUserEmailAndName(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!profile?.user.email) {
    throw new Error("User email not found");
  }

  return { email: profile.user.email, name: profile.user.name };
}

export async function sendLegalNameReminder(userId: string) {
  const adminId = await requireAdmin();

  try {
    const { email, name } = await getUserEmailAndName(userId);

    const day = new Date().toISOString().slice(0, 10);
    await notify({
      userId,
      actorId: adminId,
      domain: "admin_notice",
      type: "LEGAL_NAME",
      title: "Please update your legal name",
      message:
        "Your legal name is required before documents and payouts can be processed.",
      href: "/dashboard/settings",
      entityType: "user_profile",
      entityId: userId,
      dedupeKey: `admin-notice:legal-name:${userId}:${day}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: {
        to: email,
        subject: "Action Required: Please Update Your Legal Name",
        category: "admin_notice_legal_name",
        idempotencyKey: `admin-notice:legal-name:${userId}:${day}`,
        react: LegalNameReminder({ userName: name }),
      },
    });

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to send email" };
  }
}

export async function sendDocumentInvalidatedNotice(
  userId: string,
  documentType: string,
) {
  const adminId = await requireAdmin();

  try {
    const { email, name } = await getUserEmailAndName(userId);

    // Delete the signed document to force re-signing
    await prisma.signedDocument.delete({
      where: {
        userId_documentType: {
          userId,
          documentType: documentType as "COI" | "NDA",
        },
      },
    });

    const day = new Date().toISOString().slice(0, 10);
    await notify({
      userId,
      actorId: adminId,
      domain: "admin_notice",
      type: "DOCUMENT_INVALIDATED",
      title: "Document re-signing needed",
      message: `Your ${documentType} document needs to be signed again.`,
      href: "/dashboard/documents",
      entityType: "signed_document",
      entityId: `${userId}:${documentType}`,
      dedupeKey: `admin-notice:document-invalidated:${userId}:${documentType}:${day}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: {
        to: email,
        subject: "Action Required: Document Re-signing Needed",
        category: "admin_notice_document_invalidated",
        idempotencyKey: `admin-notice:document-invalidated:${userId}:${documentType}:${day}`,
        react: DocumentInvalidated({ userName: name, documentType }),
      },
    });

    revalidatePath("/dashboard/admin/users");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to invalidate document" };
  }
}

export async function sendPaymentInfoNotice(userId: string, reason?: string) {
  const adminId = await requireAdmin();

  try {
    const { email, name } = await getUserEmailAndName(userId);

    const day = new Date().toISOString().slice(0, 10);
    await notify({
      userId,
      actorId: adminId,
      domain: "admin_notice",
      type: "PAYMENT_INFO",
      title: "Payment information issue",
      message: reason ?? "Your payment information needs an update.",
      href: "/dashboard/settings",
      entityType: "user_profile",
      entityId: userId,
      dedupeKey: `admin-notice:payment-info:${userId}:${day}`,
      channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
      email: {
        to: email,
        subject: "Action Required: Payment Information Issue",
        category: "admin_notice_payment_info",
        idempotencyKey: `admin-notice:payment-info:${userId}:${day}`,
        react: PaymentInfoInvalid({ userName: name, reason }),
      },
    });

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to send email" };
  }
}
