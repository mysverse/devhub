import PaymentProcessed from "@/emails/PaymentProcessed";
import { uploadTransactionPdf } from "@/lib/blob-storage";
import { formatBonusPeriod } from "@/lib/bonus";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import { formatAwardType } from "@/lib/incentives";
import { EMAIL_CHANNEL, IN_APP_CHANNEL, notify } from "@/lib/notifications";
import { campaignAmountBreakdown } from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";
import { generateTransactionSlipBuffer } from "@/lib/transaction-slip-pdf";
import { getUserEmailAndName } from "@/lib/user-contact";

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
