import { NextResponse } from "next/server";
import { sweepMissingPaymentConfirmations } from "@/lib/payment-confirmation";

/**
 * Re-sends payment confirmations that never reached the developer.
 *
 * Every call site of sendPaymentConfirmation() swallows its failures on
 * purpose — the payment has already gone out and must not be reported as
 * failed. This is what catches what that drops, including on the webhook and
 * automated payout paths where no admin is watching a toast.
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepMissingPaymentConfirmations();
  return NextResponse.json(result);
}
