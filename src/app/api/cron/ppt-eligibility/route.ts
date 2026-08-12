import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runPptStabilityChecks } from "@/lib/ppt-eligibility";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checked = await runPptStabilityChecks();
  return NextResponse.json({ checked });
}
