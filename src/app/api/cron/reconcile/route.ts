import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runBatch } from "@/lib/fault-isolation";
import { sweepMissingPaymentConfirmations } from "@/lib/payment-confirmation";

/**
 * Repairs work that was committed but whose follow-up never happened.
 *
 * Every best-effort side effect in this codebase swallows its own failure on
 * purpose — the state transition already happened and must not be reported as
 * failed. That is correct, and the cost is that the follow-up silently
 * vanishes. This is the reader for all of it.
 *
 * The array below IS the registry, deliberately here rather than in a shared
 * `src/lib` module: a library file listing every domain's reconciler would
 * import payments, incentives and notifications into something anything could
 * import. Keeping it in the composition root gets the same "a new reconciler
 * is one entry" property with the dependency direction enforced by file
 * location rather than by a comment.
 *
 * Each runs through `runBatch`, so one reconciler's own selection query
 * failing cannot stop the rest — the failure this whole cron exists to prevent
 * would otherwise reappear one level up.
 */
const RECONCILERS = [
  { name: "payment-confirmations", run: sweepMissingPaymentConfirmations },
] as const;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const batch = await runBatch({
    label: "reconcile",
    items: RECONCILERS,
    identify: (reconciler) => reconciler.name,
    run: async (reconciler) => {
      results[reconciler.name] = await reconciler.run();
    },
  });

  return NextResponse.json({
    ran: batch.scanned,
    failed: batch.failed,
    results,
  });
}
