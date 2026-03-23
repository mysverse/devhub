"use server";

import { revalidatePath } from "next/cache";
import PaymentProcessed from "@/emails/PaymentProcessed";
import PaymentRejected from "@/emails/PaymentRejected";
import { getSession } from "@/lib/auth-utils";
import { uploadTransactionPdf } from "@/lib/blob-storage";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";
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

    // Send payment confirmation email with PDF slip (non-blocking)
    try {
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
    } catch (emailError) {
      console.error("Failed to send payment confirmation email:", emailError);
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update transaction" };
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
