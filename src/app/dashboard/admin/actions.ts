"use server";

import { revalidatePath } from "next/cache";
import PaymentProcessed from "@/emails/PaymentProcessed";
import { getSession } from "@/lib/auth-utils";
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
