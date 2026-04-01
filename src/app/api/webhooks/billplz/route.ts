import { NextResponse } from "next/server";
import { verifyCallbackSignature } from "@/lib/billplz";
import { handlePayoutCompletion, handlePayoutFailure } from "@/lib/payout";
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
    await handlePayoutCompletion(payout.id, payout.transactionId);
  } else if (status === "failed") {
    await handlePayoutFailure(
      payout.id,
      params.error_message || "Payment order failed",
    );
  }

  return NextResponse.json({ success: true });
}
