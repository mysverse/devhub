import { revalidateTag } from "next/cache";
import { LINEAR_USERS } from "@/dev/fixtures/linear";
import { getDevState, resetDevState } from "@/dev/state";
import { TAGS } from "@/lib/cache-tags";
import { isDevMode } from "@/lib/dev-mode";

/**
 * Dev-mode only: POST /api/dev/reset restores the in-memory mock state
 * (Linear workspace, payment orders, Redis, blobs) to the seeded baseline
 * and revalidates the caches built from it. DB rows created during the
 * session are untouched — use `pnpm dev:mock:reset` for a full DB reset.
 */
export async function POST() {
  if (!isDevMode()) return new Response("Not found", { status: 404 });

  resetDevState();
  revalidateTag(TAGS.workspacePpts, { expire: 0 });
  for (const user of LINEAR_USERS) {
    revalidateTag(TAGS.userIssues(user.id), { expire: 0 });
  }

  console.log("[dev-mode] In-memory mock state reset to seeded baseline");
  return Response.json({ reset: true });
}

/** Convenience inspector: GET /api/dev/reset reports mock state counts. */
export async function GET() {
  if (!isDevMode()) return new Response("Not found", { status: 404 });
  const state = getDevState();
  return Response.json({
    linearIssues: state.linear.issues.size,
    linearLabels: state.linear.labels.length,
    upstashKeys: state.upstash.size,
    billplzOrders: state.billplz.size,
    xenditDisbursements: state.xendit.size,
    blobs: state.blobs.size,
    counters: state.counters,
  });
}
