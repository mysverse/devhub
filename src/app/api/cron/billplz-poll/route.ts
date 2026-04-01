import { NextResponse } from "next/server";
import { sendPaymentConfirmation } from "@/app/dashboard/admin/actions";
import { getPaymentOrder } from "@/lib/billplz";
import prisma from "@/lib/prisma";

/**
 * Polls Billplz for all PROCESSING payouts and updates their status.
 * Intended to be called via Vercel Cron or an external scheduler.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const processingPayouts = await prisma.payout.findMany({
    where: {
      provider: "BILLPLZ",
      status: "PROCESSING",
      providerPayoutId: { not: null },
    },
    include: { transaction: true },
  });

  if (processingPayouts.length === 0) {
    return NextResponse.json({ updated: 0, errors: 0 });
  }

  let updated = 0;
  let errors = 0;

  for (const payout of processingPayouts) {
    try {
      const order = await getPaymentOrder(payout.providerPayoutId!);

      if (order.status === "completed") {
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });

        await prisma.transaction.update({
          where: { id: payout.transactionId },
          data: { status: "PAID", paidAt: new Date() },
        });

        sendPaymentConfirmation(payout.transactionId).catch((err) =>
          console.error(
            `Failed to send payment confirmation for ${payout.transactionId}:`,
            err,
          ),
        );

        updated++;
      } else if (order.status === "failed") {
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "FAILED", errorMessage: "Payment order failed" },
        });

        errors++;
      }
      // "pending"/"processing" → no action, check again next run
    } catch (err) {
      console.error(
        `Failed to poll Billplz for payout ${payout.id}:`,
        err,
      );
      errors++;
    }
  }

  return NextResponse.json({
    polled: processingPayouts.length,
    updated,
    errors,
  });
}
