import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runCampaignLifecycle } from "@/lib/payout-campaign-lifecycle";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCampaignLifecycle();
  return NextResponse.json(result);
}
