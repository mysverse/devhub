import { NextResponse } from "next/server";
import { getPaymentOrder } from "@/lib/billplz";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { handlePayoutCompletion, handlePayoutFailure } from "@/lib/payout";
import prisma from "@/lib/prisma";

/**
 * Polls Billplz for all PROCESSING payouts and updates their status.
 * Intended to be called via Vercel Cron or an external scheduler.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
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
      if (!payout.providerPayoutId) continue;
      const order = await getPaymentOrder(payout.providerPayoutId);

      if (order.status === "completed") {
        const wasUpdated = await handlePayoutCompletion(
          payout.id,
          payout.transactionId,
        );
        if (wasUpdated) updated++;
      } else if (order.status === "failed") {
        await handlePayoutFailure(payout.id, "Payment order failed");
        errors++;
      }
      // "pending"/"processing" → no action, check again next run
    } catch (err) {
      console.error(`Failed to poll Billplz for payout ${payout.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    polled: processingPayouts.length,
    updated,
    errors,
  });
}
