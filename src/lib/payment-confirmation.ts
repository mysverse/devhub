import PaymentProcessed from "@/emails/PaymentProcessed";
import { uploadTransactionPdf } from "@/lib/blob-storage";
import { formatBonusPeriod } from "@/lib/bonus";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { formatAwardType } from "@/lib/incentives";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import {
  CONFIRMATION_EMAIL_CHANNEL,
  paymentConfirmationDedupeKey,
  selectTransactionsNeedingConfirmation,
} from "@/lib/payment-confirmation-sweep";
import { campaignAmountBreakdown } from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";
import { getUserEmailAndName } from "@/lib/user-contact";

/** The sweep hardcodes the channel to stay Prisma-free; fail the build rather
 *  than let it silently look for deliveries on a channel nothing writes. */
const _channelsAgree: typeof EMAIL_CHANNEL = CONFIRMATION_EMAIL_CHANNEL;
void _channelsAgree;

/**
 * Generate PDF slip, upload to blob, and send payment confirmation email.
 * Shared between manual "Mark as Paid" and automated Billplz callback flows.
 *
 * Server-internal helper. This deliberately lives OUTSIDE any `"use server"`
 * module: as a Server Action it would be a public endpoint that regenerates
 * and emails a slip containing the developer's legal name and bank details.
 * It also runs on the webhook/cron path where no admin session exists, so it
 * cannot be protected with `requireAdmin()` — keep it un-exported from
 * `actions.ts`.
 */
export async function sendPaymentConfirmation(
  transactionId: string,
): Promise<void> {
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
  // The confirmation email lands before anyone opens the slip, so the
  // campaign arithmetic goes here too rather than only in the PDF.
  const campaignLine =
    transaction.campaignMultiplier && transaction.campaignMultiplier > 1
      ? [
          {
            label: `${transaction.campaignApplications[0]?.campaign.name ?? "Campaign"} multiplier`,
            amount: campaignAmountBreakdown({
              baseAmount: transaction.baseAmount ?? transaction.amount,
              multiplier: transaction.campaignMultiplier,
              finalAmount: transaction.amount,
              currency: transaction.currency as CurrencyCode,
              campaignName:
                transaction.campaignApplications[0]?.campaign.name ??
                "Campaign",
            }),
          },
        ]
      : [];

  const sourceLineItems =
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

  const lineItems =
    campaignLine.length > 0
      ? [...(sourceLineItems ?? []), ...campaignLine]
      : sourceLineItems;

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
    dedupeKey: paymentConfirmationDedupeKey(transactionId),
    channels: [IN_APP_CHANNEL, EMAIL_CHANNEL],
    email: {
      to: email,
      subject: "Payment Processed - MYSverse DevHub",
      category: "payment_processed",
      idempotencyKey: paymentConfirmationDedupeKey(transactionId),
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

/** How far back the sweep looks for paid transactions. */
const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Rows scanned per run. */
const SWEEP_SCAN_LIMIT = 100;
/**
 * Confirmations actually re-sent per run. Each one regenerates and uploads a
 * PDF slip, so a backlog is worked off over several hours rather than in one
 * invocation — and what was left behind is logged, not silently dropped.
 */
const SWEEP_RESEND_LIMIT = 10;

export type ConfirmationSweepResult = {
  checked: number;
  missing: number;
  resent: number;
  failed: number;
  deferred: number;
};

/**
 * Re-send confirmations for recently paid transactions whose developer was
 * never told. See payment-confirmation-sweep.ts for why this exists and for
 * the rule deciding what counts as missing.
 *
 * Keyed on the notification dedupe key rather than a relation: the schema has
 * no Transaction → Notification foreign key, so this is a keyed diff over two
 * queries.
 */
export async function sweepMissingPaymentConfirmations(): Promise<ConfirmationSweepResult> {
  const now = Date.now();
  const paid = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: new Date(now - SWEEP_LOOKBACK_MS) },
    },
    select: { id: true },
    orderBy: { paidAt: "desc" },
    take: SWEEP_SCAN_LIMIT,
  });

  if (paid.length === 0) {
    return { checked: 0, missing: 0, resent: 0, failed: 0, deferred: 0 };
  }

  const notifications = await prisma.notification.findMany({
    where: {
      dedupeKey: {
        in: paid.map((transaction) =>
          paymentConfirmationDedupeKey(transaction.id),
        ),
      },
    },
    select: {
      dedupeKey: true,
      deliveries: {
        select: {
          channel: true,
          status: true,
          updatedAt: true,
          skippedReason: true,
        },
      },
    },
  });

  const missing = selectTransactionsNeedingConfirmation(
    paid.map((transaction) => transaction.id),
    notifications,
    now,
  );

  let resent = 0;
  let failed = 0;
  // Each send is isolated: one developer whose slip cannot be generated must
  // not stop the rest from being told they were paid.
  for (const transactionId of missing.slice(0, SWEEP_RESEND_LIMIT)) {
    try {
      await sendPaymentConfirmation(transactionId);
      resent++;
    } catch (error) {
      failed++;
      console.error(
        `[payout-confirmations] resend failed for ${transactionId}:`,
        error,
      );
    }
  }

  const deferred = Math.max(0, missing.length - SWEEP_RESEND_LIMIT);
  if (missing.length > 0) {
    console.log(
      `[payout-confirmations] ${missing.length} of ${paid.length} paid transactions had no confirmation; ` +
        `resent ${resent}, failed ${failed}, deferred ${deferred}`,
    );
  }
  if (paid.length === SWEEP_SCAN_LIMIT) {
    console.log(
      `[payout-confirmations] scan hit its ${SWEEP_SCAN_LIMIT}-row limit; older paid transactions were not checked this run`,
    );
  }

  return {
    checked: paid.length,
    missing: missing.length,
    resent,
    failed,
    deferred,
  };
}
