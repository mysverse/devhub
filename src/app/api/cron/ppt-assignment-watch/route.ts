import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runPptAssignmentWatch } from "@/lib/ppt-assignment-watch";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPptAssignmentWatch();
  return NextResponse.json(result);
}
