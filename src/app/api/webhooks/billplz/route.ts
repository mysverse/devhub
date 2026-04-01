import { NextResponse } from "next/server";
import { sendPaymentConfirmation } from "@/app/dashboard/admin/actions";
import { verifyCallbackSignature } from "@/lib/billplz";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.text();
  const params: Record<string, string> = {};
  for (const pair of new URLSearchParams(body)) {
    params[pair[0]] = pair[1];
  }

  // Verify signature
  const signature = params.x_signature;
  if (!signature || !verifyCallbackSignature(params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const billplzId = params.id;
  const status = params.status;

  if (!billplzId || !status) {
    return NextResponse.json(
      { error: "Missing id or status" },
      { status: 400 },
    );
  }

  // Find the payout record
  const payout = await prisma.payout.findUnique({
    where: { providerPayoutId: billplzId },
    include: { transaction: true },
  });

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  // Idempotency: skip if already in a terminal state
  if (payout.status === "COMPLETED" || payout.status === "FAILED") {
    return NextResponse.json({ success: true });
  }

  if (status === "completed") {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Mark the parent transaction as paid
    await prisma.transaction.update({
      where: { id: payout.transactionId },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });

    // Send payment confirmation email + PDF
    try {
      await sendPaymentConfirmation(payout.transactionId);
    } catch (err) {
      console.error(
        "Failed to send payment confirmation from Billplz callback:",
        err,
      );
    }
  } else if (status === "failed") {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        errorMessage: params.error_message || "Payment order failed",
      },
    });
  }

  return NextResponse.json({ success: true });
}
