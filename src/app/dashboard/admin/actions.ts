"use server";

import { revalidatePath } from "next/cache";
import PaymentProcessed from "@/emails/PaymentProcessed";
import PaymentRejected from "@/emails/PaymentRejected";
import { getSession } from "@/lib/auth-utils";
import { createPaymentOrderCollection } from "@/lib/billplz";
import { uploadTransactionPdf } from "@/lib/blob-storage";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { sendEmail } from "@/lib/email";
import { initiateBillplzPayout } from "@/lib/payout";
import prisma from "@/lib/prisma";
import { BILLPLZ_COLLECTION_ID_KEY, getKV, setKV } from "@/lib/redis";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";
import { getBaseUrl } from "@/lib/url";
import { getUserEmailAndName } from "./email-actions";

// In a real application, you should verify if the user has an ADMIN role in Clerk/Database.
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

/**
 * Generate PDF slip, upload to blob, and send payment confirmation email.
 * Shared between manual "Mark as Paid" and automated Billplz callback flows.
 */
export async function sendPaymentConfirmation(transactionId: string) {
  const { buffer, filename, transaction } =
    await generateTransactionSlipBuffer(transactionId);

  // Store PDF in Vercel Blob for permanent access
  try {
    const pdfBlobUrl = await uploadTransactionPdf(transactionId, buffer);
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { pdfBlobUrl },
    });
  } catch (blobError) {
    console.error("Failed to upload PDF to blob storage:", blobError);
  }

  const { email, name } = await getUserEmailAndName(transaction.userId);

  const taskTitle =
    transaction.linearIssueTitle ||
    transaction.linearIssueIdentifier ||
    "Manual Bonus";

  await sendEmail({
    to: email,
    subject: "Payment Processed - MYSverse DevHub",
    react: PaymentProcessed({
      userName: name,
      amount: formatAmount(
        transaction.amount,
        transaction.currency as CurrencyCode,
      ),
      taskTitle,
    }),
    attachments: [{ filename, content: Buffer.from(buffer) }],
  });
}

export async function markTransactionAsPaid(transactionId: string) {
  await requireAdmin();

  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });

    revalidatePath("/dashboard/admin");

    // Send payment confirmation email with PDF slip
    try {
      await sendPaymentConfirmation(transactionId);
    } catch (err) {
      console.error("Failed to send payment confirmation email:", err);
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update transaction" };
  }
}

export async function payViaBillplz(transactionId: string) {
  await requireAdmin();

  try {
    const result = await initiateBillplzPayout(transactionId);
    if (!result) {
      return { error: "Transaction is not eligible for Billplz payout" };
    }

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to process Billplz payout" };
  }
}

export async function rejectTransaction(
  transactionId: string,
  reason?: string,
) {
  await requireAdmin();

  try {
    const transaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      },
    });

    revalidatePath("/dashboard/admin");

    // Generate and store rejection slip in Vercel Blob
    try {
      const { buffer } = await generateTransactionSlipBuffer(transactionId);
      const pdfBlobUrl = await uploadTransactionPdf(transactionId, buffer);
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { pdfBlobUrl },
      });
    } catch (blobError) {
      console.error(
        "Failed to upload rejection PDF to blob storage:",
        blobError,
      );
    }

    // Send rejection notification email (non-blocking)
    try {
      const { email, name } = await getUserEmailAndName(transaction.userId);

      const taskTitle =
        transaction.linearIssueTitle ||
        transaction.linearIssueIdentifier ||
        "Manual Bonus";

      await sendEmail({
        to: email,
        subject: "Payout Rejected - MYSverse DevHub",
        react: PaymentRejected({
          userName: name,
          amount: formatAmount(
            transaction.amount,
            transaction.currency as CurrencyCode,
          ),
          taskTitle,
          reason: reason || undefined,
        }),
      });
    } catch (emailError) {
      console.error("Failed to send rejection notification email:", emailError);
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to reject transaction" };
  }
}

export async function createBillplzCollection(title: string) {
  await requireAdmin();

  try {
    const callbackUrl = `${getBaseUrl()}/api/webhooks/billplz`;

    const collection = await createPaymentOrderCollection({
      title: title.trim(),
      callbackUrl,
    });

    await setKV(BILLPLZ_COLLECTION_ID_KEY, collection.id);

    revalidatePath("/dashboard/admin");
    return { success: true, collection };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to create collection" };
  }
}

export async function getBillplzCollectionId() {
  await requireAdmin();

  const redisId = await getKV(BILLPLZ_COLLECTION_ID_KEY);
  const envId = process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID || null;
  return { redisId, envId };
}
