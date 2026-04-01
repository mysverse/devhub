import { NextResponse } from "next/server";
import { handlePayoutCompletion, handlePayoutFailure } from "@/lib/payout";
import prisma from "@/lib/prisma";
import { isXenditEnabled, verifyWebhookToken } from "@/lib/xendit";

export async function POST(req: Request) {
  if (!isXenditEnabled()) {
    return NextResponse.json(
      { error: "Xendit is not configured" },
      { status: 503 },
    );
  }

  // Verify callback token
  const callbackToken = req.headers.get("x-callback-token");
  if (!callbackToken || !verifyWebhookToken(callbackToken)) {
    return NextResponse.json(
      { error: "Invalid callback token" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const disbursementId: string | undefined = body.id;
  const status: string | undefined = body.status;

  if (!disbursementId || !status) {
    return NextResponse.json(
      { error: "Missing id or status" },
      { status: 400 },
    );
  }

  // Find the payout record by Xendit disbursement ID
  const payout = await prisma.payout.findUnique({
    where: { providerPayoutId: disbursementId },
    include: { transaction: true },
  });

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  // Idempotency: skip if already in a terminal state
  if (payout.status === "COMPLETED" || payout.status === "FAILED") {
    return NextResponse.json({ success: true });
  }

  if (status === "COMPLETED") {
    await handlePayoutCompletion(payout.id, payout.transactionId);
  } else if (status === "FAILED") {
    const errorMessage =
      body.failure_code || body.failure_reason || "Disbursement failed";
    await handlePayoutFailure(payout.id, errorMessage);
  }

  return NextResponse.json({ success: true });
}
