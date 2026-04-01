import { createPaymentOrder } from "@/lib/billplz";
import { isBillplzSupported } from "@/lib/payment-validation";
import prisma from "@/lib/prisma";

/**
 * Initiate a Billplz payout for a transaction.
 * Shared between admin manual trigger and automated auto-payout from webhooks.
 *
 * Returns the created payout record, or null if ineligible.
 * Throws on unexpected errors (e.g. Billplz API failure after payout record creation).
 */
export async function initiateBillplzPayout(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: true, payout: true },
  });

  if (!transaction) throw new Error("Transaction not found");
  if (transaction.status !== "PENDING") return null;
  if (transaction.currency !== "MYR") return null;

  const { user } = transaction;
  if (!user.bankName || !user.bankAccountNumber || !user.bankAccountName) {
    return null;
  }
  if (!isBillplzSupported(user.bankName)) return null;

  // Skip if there's already an active payout
  if (transaction.payout) {
    if (
      transaction.payout.status === "PROCESSING" ||
      transaction.payout.status === "COMPLETED"
    ) {
      return null;
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

    return payout;
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
}
