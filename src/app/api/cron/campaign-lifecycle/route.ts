import { NextResponse } from "next/server";
import { runCampaignLifecycle } from "@/lib/payout-campaign-lifecycle";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCampaignLifecycle();
  return NextResponse.json(result);
}
