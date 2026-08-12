import { transientErrorCode } from "@/lib/prisma-retry";

/**
 * Running work that must not take its caller down with it.
 *
 * Two shapes, one contract: **neither function ever throws.** That is the
 * whole point. It is what lets a call site shrink its `try` to the region
 * where a failure genuinely means "the effect did not happen", so an operation
 * that already succeeded can stop being reported as a failure.
 *
 * The two are deliberately NOT one function. They share about five lines, and
 * everything else differs: ordered heterogeneous named steps whose outcome a
 * server action shows in a toast, versus bounded homogeneous items whose tally
 * a cron serialises into a Vercel log. Merging them would produce a signature
 * where half the fields are meaningless to each caller.
 *
 * Both run sequentially and never `Promise.allSettled`. Follow-up steps are
 * order-dependent (incentive awards must be marked PAID before the slip that
 * reads them is generated), and unbounded fan-out at Prisma Accelerate is what
 * caused the 2026-08-12 incident in the first place.
 */

export type FollowUpStep = {
  /** Short kebab-case identifier; appears in the log line and in `detail`. */
  name: string;
  run: () => Promise<unknown>;
};

export type FollowUpFailure = {
  name: string;
  /** `transientErrorCode()` of the thrown error — `P6000`, `503`, a class. */
  code: string;
};

export type FollowUpReport = {
  ok: boolean;
  failed: FollowUpFailure[];
  /**
   * One human-readable cause for the UI, or null when everything ran. The
   * analogue of `sectionDetail()` on the read side.
   */
  detail: string | null;
};

export type FollowUpOptions = {
  /**
   * Called once per failed step, after it is logged. For recording a durable
   * trace or alerting. A throw here is caught and ignored — a reporting hook
   * must never be able to break the contract it exists to report on.
   */
  onFailure?: (failure: {
    label: string;
    name: string;
    code: string;
    error: unknown;
  }) => void;
};

function describeFailures(failed: FollowUpFailure[]): string | null {
  if (failed.length === 0) return null;
  const [first, ...rest] = failed;
  const head = `${first.name} (${first.code})`;
  return rest.length === 0 ? head : `${head} and ${rest.length} more`;
}

/**
 * Run ordered follow-up steps, isolating each. Returns what happened rather
 * than throwing, so the caller can tell the user "the payment went through but
 * the confirmation email did not" instead of reporting a failure for work that
 * already succeeded.
 */
export async function runFollowUps(
  label: string,
  steps: FollowUpStep[],
  options: FollowUpOptions = {},
): Promise<FollowUpReport> {
  const failed: FollowUpFailure[] = [];

  for (const step of steps) {
    try {
      // Inside the try, not before it: a `run` that throws synchronously
      // before returning its promise must be caught too.
      await step.run();
    } catch (error) {
      const code = transientErrorCode(error);
      failed.push({ name: step.name, code });
      console.error(`[${label}] follow-up "${step.name}" failed:`, error);
      try {
        options.onFailure?.({ label, name: step.name, code, error });
      } catch (hookError) {
        console.error(`[${label}] onFailure hook threw:`, hookError);
      }
    }
  }

  return { ok: failed.length === 0, failed, detail: describeFailures(failed) };
}

/** Whether a specific named step failed, for a caller that treats one step
 *  differently from the rest (e.g. offering a resend). */
export function followUpFailed(report: FollowUpReport, name: string): boolean {
  return report.failed.some((failure) => failure.name === name);
}

export type BatchRunResult<TOutcome extends string = never> = {
  label: string;
  /** Items actually considered this run. */
  scanned: number;
  succeeded: number;
  failed: number;
  /** Items left for the next run because `workLimit` was reached. */
  deferred: number;
  /** The fetch came back exactly at `scanLimit`, so older rows went unseen. */
  scanTruncated: boolean;
  outcomes: Record<TOutcome, number>;
};

export type BatchRunOptions<TItem, TOutcome extends string> = {
  label: string;
  items: readonly TItem[];
  /**
   * The `take:` the caller used when fetching `items`. Only used to report
   * truncation — a bound that is invisible in the logs reads as "there was
   * nothing else", which is how a backlog hides.
   */
  scanLimit?: number;
  /** Maximum items to process this run; the rest are deferred and counted. */
  workLimit?: number;
  /** Stable identifier for the failure log line. */
  identify: (item: TItem) => string;
  run: (item: TItem) => Promise<TOutcome | void>;
};

/**
 * Run one operation per item, isolating each so a single bad row cannot abort
 * the sweep — the shape `data-retention` already implements by hand and every
 * other batch cron does not.
 */
export async function runBatch<TItem, TOutcome extends string = never>(
  options: BatchRunOptions<TItem, TOutcome>,
): Promise<BatchRunResult<TOutcome>> {
  const { label, items, scanLimit, workLimit, identify, run } = options;
  const work = workLimit == null ? items : items.slice(0, workLimit);

  let succeeded = 0;
  let failed = 0;
  const outcomes = {} as Record<TOutcome, number>;

  for (const item of work) {
    try {
      const outcome = await run(item);
      succeeded++;
      if (outcome) outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch (error) {
      failed++;
      let id: string;
      try {
        id = identify(item);
      } catch {
        id = "<unidentifiable>";
      }
      console.error(`[${label}] ${id} failed:`, error);
    }
  }

  const deferred = items.length - work.length;
  const scanTruncated = scanLimit != null && items.length >= scanLimit;

  console.log(
    `[${label}] scanned ${work.length}, succeeded ${succeeded}, failed ${failed}` +
      (deferred > 0 ? `, deferred ${deferred}` : ""),
  );
  if (scanTruncated) {
    console.log(
      `[${label}] scan hit its ${scanLimit}-row limit; older rows were not checked this run`,
    );
  }

  return {
    label,
    scanned: work.length,
    succeeded,
    failed,
    deferred,
    scanTruncated,
    outcomes,
  };
}
