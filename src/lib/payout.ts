import { awardAchievement } from "@/lib/achievements";
import { recordActivationEvent } from "@/lib/activation-events";
import { createPaymentOrder } from "@/lib/billplz";
import { formatBonusPeriod } from "@/lib/bonus";
import { ADMIN_ACCESS_WHERE } from "@/lib/developer-access";
import { runBatch, runFollowUps } from "@/lib/fault-isolation";
import { isKycApproved, requiresKycForAutoPayout } from "@/lib/kyc";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { sendPaymentConfirmation } from "@/lib/payment-confirmation";
import {
  getXenditBankCode,
  isBillplzSupported,
  isXenditSupported,
} from "@/lib/payment-validation";
import {
  describePayoutReconcileReason,
  PAYOUT_STALE_MS,
  selectUnreconciledPayouts,
} from "@/lib/payout-reconcile";
import prisma from "@/lib/prisma";
import { createFinSysPayout, verifyGroupMembership } from "@/lib/roblox";
import { createDisbursement, isXenditEnabled } from "@/lib/xendit";

function getTransactionPayoutDescription(transaction: {
  source?: string | null;
  bonusPeriod?: string | null;
  linearIssueIdentifier?: string | null;
  linearIssueTitle?: string | null;
}) {
  if (transaction.source === "BONUS") {
    return `Bonus: ${formatBonusPeriod(transaction.bonusPeriod)}`;
  }
  if (transaction.source === "INCENTIVE") {
    return transaction.linearIssueTitle || "DevHub incentive awards";
  }
  if (transaction.linearIssueIdentifier) {
    return `PPT: ${transaction.linearIssueIdentifier} - ${transaction.linearIssueTitle || ""}`;
  }
  return "Manual Payout";
}

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

  const paidTx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { userId: true, source: true },
  });
  if (paidTx?.source === "PPT") {
    await awardAchievement(paidTx.userId, "FIRST_PAYOUT", { transactionId });
  }
  if (paidTx?.userId) {
    await recordActivationEvent({
      userId: paidTx.userId,
      kind: "payout_paid",
      entityId: transactionId,
      metadata: { source: paidTx.source },
    });
  }

  try {
    const { markIncentiveAwardsPaidForTransaction } = await import(
      "@/lib/incentives"
    );
    await markIncentiveAwardsPaidForTransaction(transactionId);
  } catch (err) {
    console.error(
      `Failed to mark incentive awards paid for ${transactionId}:`,
      err,
    );
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
    include: {
      user: { include: { user: { select: { email: true } } } },
      payout: true,
    },
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
  const description = getTransactionPayoutDescription(transaction);

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
  // Only the API call belongs in this try. The write below records the
  // provider's id for a payment order Billplz has already accepted; if it
  // threw, the catch stamped the payout FAILED with providerPayoutId still
  // NULL — and billplz-poll filters on providerPayoutId: { not: null }, so
  // that row became invisible to every automated path forever while the admin
  // was invited to pay again. billplz.ts sends no idempotency key, so that
  // second attempt is real money a second time.
  let result: Awaited<ReturnType<typeof createPaymentOrder>>;
  try {
    result = await createPaymentOrder({
      bankCode: user.bankName,
      bankAccountNumber: user.bankAccountNumber,
      name: user.bankAccountName,
      description,
      totalCents: amountCents,
      email: user.user.email,
      reference1: transactionId,
      reference2: transaction.linearIssueUrl || undefined,
    });
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

  console.log(
    `[payout] Billplz API returned id=${result.id} status=${result.status}`,
  );

  // Billplz has accepted the order. Recording its id is what makes the payout
  // visible to billplz-poll, so it is attempted on its own and a failure here
  // leaves the payout PENDING (in-flight, pay button disabled) rather than
  // FAILED. sweepUnreconciledPayouts raises it for an admin after six hours.
  const settle = await runFollowUps("billplz-payout-settle", [
    {
      name: "provider-id",
      run: () =>
        prisma.payout.update({
          where: { id: payout.id },
          data: { providerPayoutId: result.id, status: "PROCESSING" },
        }),
    },
  ]);

  if (!settle.ok) {
    console.error(
      `[payout] Billplz accepted order ${result.id} for payout ${payout.id} but recording it failed ` +
        `(${settle.detail}) — left non-terminal on purpose; sweepUnreconciledPayouts will flag it`,
    );
  }

  return payout;
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

  const description = getTransactionPayoutDescription(transaction);

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
  // The FinSys call is the ONLY statement here whose failure means the money
  // did not move, so it is the only one inside this try. Everything after it
  // is bookkeeping on Robux that has already left the group.
  //
  // It used to all be one try: a transient failure on the update or the
  // completion ran handlePayoutFailure, which stamps the payout FAILED. That
  // re-enables the admin's pay button (classifyPayoutRoute only treats
  // PENDING/PROCESSING as in-flight), and a second press deletes this payout
  // row and creates a new one — sending the same Robux again. FinSys exposes
  // no read endpoint and accepts no idempotency key, so nothing in DevHub can
  // detect or undo that.
  let result: Awaited<ReturnType<typeof createFinSysPayout>>;
  try {
    result = await createFinSysPayout({
      robloxUserId: Number(user.robloxId),
      amount: transaction.amount,
      reason:
        transaction.source === "BONUS"
          ? `DevHub bonus: ${formatBonusPeriod(transaction.bonusPeriod)}`
          : transaction.source === "INCENTIVE"
            ? `DevHub incentive: tx ${transactionId}`
            : `DevHub payout: tx ${transactionId}`,
    });
  } catch (error) {
    // The request itself failed, so nothing was disbursed. Safe to mark FAILED
    // and let the admin retry.
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[payout] FinSys request failed for ${payout.id}:`, error);
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

  console.log(
    `[payout] FinSys response for payout ${payout.id}:`,
    JSON.stringify(result),
  );

  if (!result.success) {
    // FinSys answered and said no — also safe to mark FAILED.
    const errorMsg = result.message || "FinSys payout failed";
    await handlePayoutFailure(payout.id, errorMsg);
    throw new Error(`Roblox payout failed: ${errorMsg}`);
  }

  // Past this line the Robux has left the group. A failure below leaves the
  // payout PENDING, which reads as in-flight and keeps the pay button
  // disabled; sweepUnreconciledPayouts flags it for an admin after six hours.
  // Never FAILED, which would invite a second send.
  const settle = await runFollowUps("roblox-payout-settle", [
    {
      name: "provider-response",
      run: () =>
        prisma.payout.update({
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
        }),
    },
    {
      name: "completion",
      run: () => handlePayoutCompletion(payout.id, transactionId),
    },
  ]);

  if (!settle.ok) {
    console.error(
      `[payout] Robux for payout ${payout.id} was SENT but settling failed (${settle.detail}) — ` +
        "left non-terminal on purpose; sweepUnreconciledPayouts will flag it",
    );
  }

  return payout;
}

/**
 * Route to the best available payout provider for a transaction.
 * MYR bank transfers: Billplz only.
 * MYR eWallets: Xendit (requires KYC + auto-payout opt-in).
 * ROBUX: Roblox group payout.
 */
export async function initiateAutoPayout(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { user: true },
  });

  if (transaction?.status !== "PENDING") return null;
  if (transaction.source !== "PPT" && transaction.source !== "INCENTIVE") {
    return null;
  }

  if (transaction.currency === "ROBUX") {
    if (!transaction.user.robloxId) return null;
    return initiateRobloxPayout(transactionId);
  }

  if (transaction.currency === "MYR") {
    const { user } = transaction;
    if (!user.bankName || !user.bankAccountNumber || !user.bankAccountName) {
      return null;
    }

    // eWallet methods route to Xendit (requires auto-payout opt-in + KYC)
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
      // Xendit handles eWallet disbursements only
      if (isXenditSupported(user.bankName)) {
        return initiateXenditPayout(transactionId);
      }
      return null;
    }

    // Bank transfers route to Billplz only
    if (isBillplzSupported(user.bankName)) {
      return initiateBillplzPayout(transactionId);
    }
  }

  return null;
}

/**
 * Raises an admin alert for payouts that no automated path can resolve.
 *
 * Alert-only by necessity, not by caution: no provider here exposes a way to
 * ask "did this disbursement happen?" keyed on anything DevHub holds. See
 * payout-reconcile.ts. Re-sending is never the repair.
 *
 * Deduped per payout per day, so a payout that stays stuck raises one alert a
 * day rather than one an hour.
 */
export async function sweepUnreconciledPayouts() {
  const now = Date.now();
  const candidates = await prisma.payout.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      updatedAt: { lt: new Date(now - PAYOUT_STALE_MS) },
    },
    select: {
      id: true,
      transactionId: true,
      provider: true,
      status: true,
      providerPayoutId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });

  const flagged = selectUnreconciledPayouts(candidates, now);
  if (flagged.length === 0) {
    return { checked: candidates.length, flagged: 0, alerted: 0, failed: 0 };
  }

  const admins = await prisma.userProfile.findMany({
    where: ADMIN_ACCESS_WHERE,
    select: { id: true },
  });
  const day = new Date(now).toISOString().slice(0, 10);

  const batch = await runBatch({
    label: "payout-reconcile",
    items: flagged,
    identify: ({ payout }) => payout.id,
    run: async ({ payout, reason }) => {
      for (const admin of admins) {
        await notify({
          userId: admin.id,
          domain: "payment",
          type: "ADMIN_PAYOUT_UNRECONCILED",
          title: `Payout needs manual reconciliation (${payout.provider})`,
          message:
            `A ${payout.provider} payout has been ${payout.status} since ` +
            `${payout.updatedAt.toISOString()} and ` +
            `${describePayoutReconcileReason(reason)}. ` +
            "Check the provider before re-sending — DevHub cannot tell whether the money moved.",
          href: "/dashboard/admin",
          entityType: "payout",
          entityId: payout.id,
          payload: {
            payoutId: payout.id,
            transactionId: payout.transactionId,
            provider: payout.provider,
            reason,
          },
          dedupeKey: `payout-unreconciled:${payout.id}:${day}`,
          channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
        });
      }
    },
  });

  return {
    checked: candidates.length,
    flagged: flagged.length,
    alerted: batch.succeeded,
    failed: batch.failed,
  };
}
