import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runPptOpenTasksDigest } from "@/lib/ppt-open-tasks-digest";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPptOpenTasksDigest();
  return NextResponse.json(result);
}
