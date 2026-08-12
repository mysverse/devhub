import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { handlePayoutCompletion, handlePayoutFailure } from "@/lib/payout";
import prisma from "@/lib/prisma";
import { getDisbursement, isXenditEnabled } from "@/lib/xendit";

/**
 * Polls Xendit for all PROCESSING payouts and updates their status.
 * Intended to be called via Vercel Cron or an external scheduler.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isXenditEnabled()) {
    return NextResponse.json({
      skipped: true,
      reason: "Xendit not configured",
    });
  }

  const processingPayouts = await prisma.payout.findMany({
    where: {
      provider: "XENDIT",
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
      const disbursement = await getDisbursement(payout.providerPayoutId);

      if (disbursement.status === "COMPLETED") {
        const wasUpdated = await handlePayoutCompletion(
          payout.id,
          payout.transactionId,
        );
        if (wasUpdated) updated++;
      } else if (disbursement.status === "FAILED") {
        await handlePayoutFailure(
          payout.id,
          disbursement.failure_code || "Disbursement failed",
        );
        errors++;
      }
      // "PENDING" → no action, check again next run
    } catch (err) {
      console.error(`Failed to poll Xendit for payout ${payout.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    polled: processingPayouts.length,
    updated,
    errors,
  });
}
