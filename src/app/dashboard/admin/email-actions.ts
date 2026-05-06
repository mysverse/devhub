"use server";

import { revalidatePath } from "next/cache";
import DocumentInvalidated from "@/emails/DocumentInvalidated";
import LegalNameReminder from "@/emails/LegalNameReminder";
import PaymentInfoInvalid from "@/emails/PaymentInfoInvalid";
import { requireAdmin } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
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
  await requireAdmin();

  try {
    const { email, name } = await getUserEmailAndName(userId);

    await sendEmail({
      to: email,
      subject: "Action Required: Please Update Your Legal Name",
      react: LegalNameReminder({ userName: name }),
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
  await requireAdmin();

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

    await sendEmail({
      to: email,
      subject: "Action Required: Document Re-signing Needed",
      react: DocumentInvalidated({ userName: name, documentType }),
    });

    revalidatePath("/dashboard/admin/users");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to invalidate document" };
  }
}

export async function sendPaymentInfoNotice(userId: string, reason?: string) {
  await requireAdmin();

  try {
    const { email, name } = await getUserEmailAndName(userId);

    await sendEmail({
      to: email,
      subject: "Action Required: Payment Information Issue",
      react: PaymentInfoInvalid({ userName: name, reason }),
    });

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to send email" };
  }
}
