import { NextResponse } from "next/server";
import {
  evaluateWeeklyIncentives,
  sendIncentiveAdminDigest,
} from "@/lib/incentives";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await evaluateWeeklyIncentives();
  const digestSent = await sendIncentiveAdminDigest();
  return NextResponse.json({ ...result, digestSent });
}
