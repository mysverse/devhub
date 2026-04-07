import { sendPaymentConfirmation } from "@/app/dashboard/admin/actions";
import { createPaymentOrder } from "@/lib/billplz";
import { isKycApproved, requiresKycForAutoPayout } from "@/lib/kyc";
import {
  getXenditBankCode,
  isBillplzSupported,
  isXenditSupported,
} from "@/lib/payment-validation";
import prisma from "@/lib/prisma";
import { createFinSysPayout, verifyGroupMembership } from "@/lib/roblox";
import { createDisbursement, isXenditEnabled } from "@/lib/xendit";

/**
 * Shared helper: mark a payout as completed and its transaction as paid.
 * Used by Billplz webhook, Xendit webhook, Roblox payout, and polling crons.
 */
export async function handlePayoutCompletion(
  payoutId: string,
  transactionId: string,
): Promise<boolean> {
  console.log(
    `[payout] Marking payout ${payoutId} as COMPLETED (tx: ${transactionId})`,
  );

  // Atomically transition payout to COMPLETED only if not already terminal
  const payoutResult = await prisma.payout.updateMany({
    where: { id: payoutId, status: { notIn: ["COMPLETED", "FAILED"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (payoutResult.count === 0) {
    console.log(
      `[payout] Payout ${payoutId} already in terminal state, skipping`,
    );
    return false;
  }

  // Atomically transition transaction to PAID only if still PENDING
  const txResult = await prisma.transaction.updateMany({
    where: { id: transactionId, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });

  if (txResult.count === 0) {
    console.log(
      `[payout] Transaction ${transactionId} already moved from PENDING, skipping email`,
    );
    return false;
  }

  try {
    await sendPaymentConfirmation(transactionId);
  } catch (err) {
    console.error(
      `Failed to send payment confirmation for ${transactionId}:`,
      err,
    );
  }

  return true;
}

/**
 * Shared helper: mark a payout as failed with an error message.
 */
export async function handlePayoutFailure(
  payoutId: string,
  errorMessage: string,
) {
  const result = await prisma.payout.updateMany({
    where: { id: payoutId, status: { notIn: ["COMPLETED", "FAILED"] } },
    data: { status: "FAILED", errorMessage },
  });

  if (result.count === 0) {
    console.log(
      `[payout] Payout ${payoutId} already in terminal state, skipping failure update`,
    );
  }
}

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
  console.log(
    `[payout] Calling Billplz API for payout ${payout.id} (tx: ${transactionId})`,
  );
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
    console.log(
      `[payout] Billplz API returned id=${result.id} status=${result.status}`,
    );

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
      apiError instanceof Error ? apiError.message : String(apiError);
    console.error(
      `[payout] Billplz API failed for payout ${payout.id}:`,
      apiError,
    );
    try {
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          errorMessage: errorMsg,
        },
      });
    } catch (dbError) {
      console.error(
        `[payout] Failed to update payout ${payout.id} to FAILED:`,
        dbError,
      );
    }
    throw new Error(`Billplz payout failed: ${errorMsg}`);
  }
}

/**
 * Initiate a Xendit disbursement for a transaction.
 * Follows the same pattern as initiateBillplzPayout.
 * Amount is in whole MYR (not cents) — Xendit uses whole currency units.
 */
export async function initiateXenditPayout(transactionId: string) {
  if (!isXenditEnabled()) return null;

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
  if (!isXenditSupported(user.bankName)) return null;

  const xenditBankCode = getXenditBankCode(user.bankName);
  if (!xenditBankCode) return null;

  // Skip if there's already an active payout
  if (transaction.payout) {
    if (
      transaction.payout.status === "PROCESSING" ||
      transaction.payout.status === "COMPLETED"
    ) {
      return null;
    }
    await prisma.payout.delete({
      where: { id: transaction.payout.id },
    });
  }

  const description = transaction.linearIssueIdentifier
    ? `PPT: ${transaction.linearIssueIdentifier} - ${transaction.linearIssueTitle || ""}`
    : "PPT Payout";

  const payout = await prisma.payout.create({
    data: {
      transactionId,
      provider: "XENDIT",
      status: "PENDING",
      providerData: {
        bankCode: xenditBankCode,
        bankAccountNumber: user.bankAccountNumber,
        accountName: user.bankAccountName,
        description,
        amount: transaction.amount,
      },
    },
  });

  console.log(
    `[payout] Calling Xendit API for payout ${payout.id} (tx: ${transactionId})`,
  );
  try {
    const result = await createDisbursement({
      externalId: transactionId,
      bankCode: xenditBankCode,
      accountHolderName: user.bankAccountName,
      accountNumber: user.bankAccountNumber,
      amount: transaction.amount,
      description,
    });
    console.log(
      `[payout] Xendit API returned id=${result.id} status=${result.status}`,
    );

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
      apiError instanceof Error ? apiError.message : String(apiError);
    console.error(
      `[payout] Xendit API failed for payout ${payout.id}:`,
      apiError,
    );
    try {
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: "FAILED", errorMessage: errorMsg },
      });
    } catch (dbError) {
      console.error(
        `[payout] Failed to update payout ${payout.id} to FAILED:`,
        dbError,
      );
    }
    throw new Error(`Xendit payout failed: ${errorMsg}`);
  }
}

/**
 * Initiate a Roblox group payout for a ROBUX transaction.
 * Synchronous — succeeds or fails immediately (no webhook/polling needed).
 */
export async function initiateRobloxPayout(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: true, payout: true },
  });

  if (!transaction) throw new Error("Transaction not found");
  if (transaction.status !== "PENDING") return null;
  if (transaction.currency !== "ROBUX") return null;

  const { user } = transaction;
  if (!user.robloxId) return null;

  // Skip if there's already an active payout
  if (transaction.payout) {
    if (
      transaction.payout.status === "PROCESSING" ||
      transaction.payout.status === "COMPLETED"
    ) {
      return null;
    }
    await prisma.payout.delete({
      where: { id: transaction.payout.id },
    });
  }

  // Verify group membership before attempting payout
  const isMember = await verifyGroupMembership(user.robloxId);
  console.log(
    `[payout] Group membership check for ${user.robuxUsername || user.robloxId}: ${isMember ? "member" : "NOT a member"}`,
  );
  if (!isMember) {
    throw new Error(
      `Roblox user ${user.robuxUsername || user.robloxId} is not a member of the group`,
    );
  }

  const payout = await prisma.payout.create({
    data: {
      transactionId,
      provider: "ROBLOX",
      status: "PENDING",
      providerData: {
        robloxUserId: user.robloxId,
        robuxUsername: user.robuxUsername,
        amount: transaction.amount,
      },
    },
  });

  console.log(
    `[payout] Sending FinSys payout ${payout.id} (tx: ${transactionId}, ${transaction.amount} Robux to ${user.robuxUsername})`,
  );
  try {
    const result = await createFinSysPayout({
      robloxUserId: Number(user.robloxId),
      amount: transaction.amount,
      reason: `DevHub payout: tx ${transactionId}`,
    });

    console.log(
      `[payout] FinSys response for payout ${payout.id}:`,
      JSON.stringify(result),
    );

    if (!result.success) {
      const errorMsg = result.message || "FinSys payout failed";
      await handlePayoutFailure(payout.id, errorMsg);
      throw new Error(`Roblox payout failed: ${errorMsg}`);
    }

    // Store full FinSys response in provider data
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        providerPayoutId: result.id ? String(result.id) : undefined,
        providerData: {
          robloxUserId: user.robloxId,
          robuxUsername: user.robuxUsername,
          amount: transaction.amount,
          finSysResponse: { ...result },
        },
      },
    });

    // Synchronous success — go directly to COMPLETED
    console.log(
      `[payout] FinSys reported success for payout ${payout.id}, marking as COMPLETED`,
    );
    await handlePayoutCompletion(payout.id, transactionId);
    return payout;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Roblox payout failed:")
    ) {
      throw error;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[payout] FinSys payout failed for ${payout.id}:`, error);
    try {
      await handlePayoutFailure(payout.id, errorMsg);
    } catch (dbError) {
      console.error(
        `[payout] Failed to update payout ${payout.id} to FAILED:`,
        dbError,
      );
    }
    throw new Error(`Roblox payout failed: ${errorMsg}`);
  }
}

/**
 * Route to the best available payout provider for a transaction.
 * MYR: Billplz first (to use remaining balance), then Xendit fallback.
 * ROBUX: Roblox group payout.
 */
export async function initiateAutoPayout(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: true },
  });

  if (!transaction || transaction.status !== "PENDING") return null;

  if (transaction.currency === "ROBUX") {
    if (!transaction.user.robloxId) return null;
    return initiateRobloxPayout(transactionId);
  }

  if (transaction.currency === "MYR") {
    const { user } = transaction;
    if (!user.bankName || !user.bankAccountNumber || !user.bankAccountName) {
      return null;
    }

    // eWallet methods require auto-payout opt-in + KYC approval
    if (requiresKycForAutoPayout(user.bankName)) {
      if (!user.autoPayoutEnabled) {
        console.log(
          `[payout] Auto-payout not enabled for user ${transaction.userId}, skipping`,
        );
        return null;
      }
      const kycOk = await isKycApproved(transaction.userId);
      if (!kycOk) {
        console.log(
          `[payout] KYC required but not approved for user ${transaction.userId}, skipping auto-payout`,
        );
        return null;
      }
    }

    // Try Billplz first (to use remaining balance)
    if (isBillplzSupported(user.bankName)) {
      try {
        return await initiateBillplzPayout(transactionId);
      } catch (err) {
        console.error(
          `[payout] Billplz failed for tx ${transactionId}, trying Xendit fallback:`,
          err,
        );
      }
    }

    // Fallback to Xendit
    if (isXenditSupported(user.bankName)) {
      return initiateXenditPayout(transactionId);
    }
  }

  return null;
}
