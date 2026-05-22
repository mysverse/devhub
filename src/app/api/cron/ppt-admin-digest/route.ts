import { NextResponse } from "next/server";
import { sendPptAdminDigest } from "@/lib/ppt-eligibility";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent = await sendPptAdminDigest();
  return NextResponse.json({ sent });
}
