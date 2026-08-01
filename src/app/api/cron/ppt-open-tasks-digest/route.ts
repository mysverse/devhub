import { NextResponse } from "next/server";
import { runPptOpenTasksDigest } from "@/lib/ppt-open-tasks-digest";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPptOpenTasksDigest();
  return NextResponse.json(result);
}
