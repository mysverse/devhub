import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  evaluateWeeklyIncentives,
  sendIncentiveAdminDigest,
} from "@/lib/incentives";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await evaluateWeeklyIncentives();
  const digestSent = await sendIncentiveAdminDigest();
  return NextResponse.json({ ...result, digestSent });
}
