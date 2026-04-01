"use server";

import { revalidatePath } from "next/cache";
import PaymentProcessed from "@/emails/PaymentProcessed";
import PaymentRejected from "@/emails/PaymentRejected";
import { getSession } from "@/lib/auth-utils";
import { createPaymentOrder } from "@/lib/billplz";
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

    // Send payment confirmation email with PDF slip (non-blocking)
    sendPaymentConfirmation(transactionId).catch((err) =>
      console.error("Failed to send payment confirmation email:", err),
    );

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update transaction" };
  }
}

export async function payViaBillplz(transactionId: string) {
  await requireAdmin();

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true, payout: true },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.status !== "PENDING")
      throw new Error("Transaction is not pending");
    if (transaction.currency !== "MYR")
      throw new Error("Billplz only supports MYR payouts");

    const { user } = transaction;
    if (!user.bankName || !user.bankAccountNumber || !user.bankAccountName) {
      throw new Error("User is missing bank account details");
    }

    // If there's an existing failed payout, delete it so we can retry
    if (transaction.payout) {
      if (
        transaction.payout.status === "PROCESSING" ||
        transaction.payout.status === "COMPLETED"
      ) {
        throw new Error(
          `Payout already ${transaction.payout.status.toLowerCase()}`,
        );
      }
      // Delete the failed payout to allow retry
      await prisma.payout.delete({
        where: { id: transaction.payout.id },
      });
    }

    const amountCents = Math.round(transaction.amount * 100);
    const description = transaction.linearIssueIdentifier
      ? `PPT: ${transaction.linearIssueIdentifier} - ${transaction.linearIssueTitle || ""}`
      : "PPT Payout";

    // Create local payout record
    const payout = await prisma.payout.create({
      data: {
        transactionId,
        provider: "BILLPLZ",
        status: "PENDING",
        providerData: {
          bankCode: user.bankName,
          bankAccountNumber: user.bankAccountNumber,
          accountName: user.bankAccountName,
          description,
          amountCents,
        },
      },
    });

    // Call Billplz API
    try {
      const result = await createPaymentOrder({
        bankCode: user.bankName,
        bankAccountNumber: user.bankAccountNumber,
        name: user.bankAccountName,
        description,
        totalCents: amountCents,
        reference1: transactionId,
        reference2: transaction.linearIssueUrl || undefined,
      });

      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          providerPayoutId: result.id,
          status: "PROCESSING",
        },
      });
    } catch (apiError) {
      const errorMsg =
        apiError instanceof Error ? apiError.message : "Billplz API error";
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          errorMessage: errorMsg,
        },
      });
      throw new Error(`Billplz payout failed: ${errorMsg}`);
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
