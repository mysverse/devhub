"use server";

import { revalidatePath } from "next/cache";
import PaymentProcessed from "@/emails/PaymentProcessed";
import PaymentRejected from "@/emails/PaymentRejected";
import { awardAchievement } from "@/lib/achievements";
import { requireAdmin } from "@/lib/authz";
import { createPaymentOrderCollection } from "@/lib/billplz";
import { uploadTransactionPdf } from "@/lib/blob-storage";
import { formatBonusPeriod } from "@/lib/bonus";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  cancelIncentiveAwardsForTransaction,
  formatAwardType,
  markIncentiveAwardsPaidForTransaction,
} from "@/lib/incentives";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import {
  initiateBillplzPayout,
  initiateRobloxPayout,
  initiateXenditPayout,
} from "@/lib/payout";
import {
  canConfirmManualPayment,
  classifyPayoutRoute,
} from "@/lib/payout-routing";
import prisma from "@/lib/prisma";
import { BILLPLZ_COLLECTION_ID_KEY, getKV, setKV } from "@/lib/redis";
import { checkFinSysHealth, refreshFinSysCookie } from "@/lib/roblox";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";
import { getBaseUrl } from "@/lib/url";
import { isXenditEnabled } from "@/lib/xendit";
import { getUserEmailAndName } from "./email-actions";

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
    transaction.source === "BONUS"
      ? transaction.linearIssueTitle ||
        `${formatBonusPeriod(transaction.bonusPeriod)} Bonus`
      : transaction.source === "INCENTIVE"
        ? transaction.linearIssueTitle || "DevHub incentive awards"
        : transaction.linearIssueTitle ||
          transaction.linearIssueIdentifier ||
          "Manual Payout";
  const lineItems =
    transaction.source === "INCENTIVE"
      ? transaction.incentiveAwards.map((award) => ({
          label: `${formatAwardType(award.type)} - ${award.period}`,
          amount: formatAmount(
            award.netAmount ?? award.amount,
            transaction.currency as CurrencyCode,
          ),
        }))
      : transaction.source === "BONUS"
        ? transaction.bonusCandidates.map((candidate) => ({
            label: `${candidate.linearIssueIdentifier ? `${candidate.linearIssueIdentifier} - ` : ""}${candidate.linearIssueTitle || "Bonus item"}`,
            amount: formatAmount(
              candidate.approvedAmount ?? 0,
              transaction.currency as CurrencyCode,
            ),
          }))
        : undefined;

  const amount = formatAmount(
    transaction.amount,
    transaction.currency as CurrencyCode,
  );
  await notify({
    userId: transaction.userId,
    domain: "payment",
    type: "PROCESSED",
    title: "Payment processed",
    message: `${amount} for ${taskTitle} has been processed.`,
    href: "/dashboard",
    entityType: "transaction",
    entityId: transactionId,
    payload: { transactionId, amount, taskTitle },
    dedupeKey: `transaction:paid:${transactionId}`,
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: {
      to: email,
      subject: "Payment Processed - MYSverse DevHub",
      category: "payment_processed",
      idempotencyKey: `transaction:paid:${transactionId}`,
      react: PaymentProcessed({
        userName: name,
        amount,
        taskTitle,
        lineItems,
      }),
      attachments: [{ filename, content: Buffer.from(buffer) }],
    },
  });
}

export async function markTransactionAsPaid(transactionId: string) {
  await requireAdmin();

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true, payout: true },
    });
    if (!transaction) return { error: "Transaction not found" };

    const route = classifyPayoutRoute({
      transactionStatus: transaction.status,
      currency: transaction.currency,
      paymentMethod: transaction.user.paymentMethod,
      paypalEmail: transaction.user.paypalEmail,
      duitNowId: transaction.user.duitNowId,
      bankName: transaction.user.bankName,
      bankAccountNumber: transaction.user.bankAccountNumber,
      bankAccountName: transaction.user.bankAccountName,
      robloxId: transaction.user.robloxId,
      payout: transaction.payout,
      xenditEnabled: isXenditEnabled(),
    });
    if (!canConfirmManualPayment(route)) {
      return { error: route.reason };
    }

    // Atomically transition only if still PENDING — prevents duplicate emails
    const result = await prisma.transaction.updateMany({
      where: { id: transactionId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });

    if (result.count === 0) {
      return {
        error:
          "Transaction is not in PENDING status (may have already been processed)",
      };
    }

    revalidatePath("/dashboard/admin");
    await markIncentiveAwardsPaidForTransaction(transactionId);
    if (transaction.source === "PPT") {
      await awardAchievement(transaction.userId, "FIRST_PAYOUT", {
        transactionId,
      });
    }

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
    // Atomically transition only if still PENDING — prevents duplicate rejections
    const result = await prisma.transaction.updateMany({
      where: { id: transactionId, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      },
    });

    if (result.count === 0) {
      return {
        error:
          "Transaction is not in PENDING status (may have already been processed)",
      };
    }

    revalidatePath("/dashboard/admin");
    await cancelIncentiveAwardsForTransaction(transactionId, reason || null);

    // Fetch the transaction for email and PDF generation
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return { success: true };
    }

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
        transaction.source === "BONUS"
          ? transaction.linearIssueTitle ||
            `${formatBonusPeriod(transaction.bonusPeriod)} Bonus`
          : transaction.source === "INCENTIVE"
            ? transaction.linearIssueTitle || "DevHub incentive awards"
            : transaction.linearIssueTitle ||
              transaction.linearIssueIdentifier ||
              "Manual Payout";

      const amount = formatAmount(
        transaction.amount,
        transaction.currency as CurrencyCode,
      );
      await notify({
        userId: transaction.userId,
        domain: "payment",
        type: "REJECTED",
        title: "Payout rejected",
        message: reason
          ? `${amount} for ${taskTitle} was rejected: ${reason}`
          : `${amount} for ${taskTitle} was rejected.`,
        href: "/dashboard",
        entityType: "transaction",
        entityId: transactionId,
        payload: { transactionId, amount, taskTitle, reason },
        dedupeKey: `transaction:rejected:${transactionId}`,
        channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
        email: {
          to: email,
          subject: "Payout Rejected - MYSverse DevHub",
          category: "payment_rejected",
          idempotencyKey: `transaction:rejected:${transactionId}`,
          react: PaymentRejected({
            userName: name,
            amount,
            taskTitle,
            reason: reason || undefined,
          }),
        },
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

export async function payViaXendit(transactionId: string) {
  await requireAdmin();

  try {
    const result = await initiateXenditPayout(transactionId);
    if (!result) {
      return { error: "Transaction is not eligible for Xendit payout" };
    }

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to process Xendit payout" };
  }
}

export async function payViaRoblox(transactionId: string) {
  await requireAdmin();

  try {
    const result = await initiateRobloxPayout(transactionId);
    if (!result) {
      return { error: "Transaction is not eligible for Roblox payout" };
    }

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to process Roblox payout" };
  }
}

export async function updateRobloxCookie(cookie: string) {
  await requireAdmin();

  try {
    const result = await refreshFinSysCookie(cookie.trim());
    if (!result.success) {
      return { error: result.message };
    }
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { error: err.message || "Failed to update Roblox cookie" };
  }
}

export async function getRobloxCookieStatus() {
  await requireAdmin();

  try {
    const health = await checkFinSysHealth();
    return {
      hasRedisCookie: health.authenticated,
      hasEnvCookie: false,
      health: {
        valid: health.healthy && health.authenticated,
        userId: health.userId ?? undefined,
        username: health.userName ?? undefined,
        checkedAt: Date.now(),
      },
    };
  } catch (error) {
    return {
      hasRedisCookie: false,
      hasEnvCookie: false,
      health: {
        valid: false,
        error: error instanceof Error ? error.message : "FinSys unreachable",
        checkedAt: Date.now(),
      },
    };
  }
}
