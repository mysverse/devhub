// The activation funnel: what a developer actually did, in order, so "where
// do people stop" is answerable without reconstructing it from five tables
// with five different notions of time.
//
// Two rules shape this module:
//
//  1. Recording NEVER breaks the thing it records. Every write site sits on a
//     path that matters — claiming, posting proof, getting paid — so this
//     follows logPiiAccess's contract exactly: never throws, never rejects, a
//     missing row is always preferable to a broken payout.
//
//  2. It records crossings, not impressions. Deliberately nothing for "viewed
//     the board" or "saw a recommendation": Next prefetches routes and
//     cacheComponents renders them ahead of time, so those rows would be
//     written for people who never looked. A number that overcounts is worse
//     than no number.

/** The moments worth knowing about, in funnel order. */
export const ACTIVATION_KINDS = [
  /** Asked for work to exist. */
  "ppt_requested",
  /** Took a task off the board. */
  "task_claimed",
  /** Posted proof that DevHub accepted as an attempt. */
  "proof_posted",
  /** Posted proof that did not qualify — the step people silently stall on. */
  "proof_rejected",
  /** Money actually landed. */
  "payout_paid",
] as const;

export type ActivationKind = (typeof ACTIVATION_KINDS)[number];

export type ActivationEventInput = {
  userId: string;
  kind: ActivationKind;
  /**
   * What it happened to — a Linear issue id, a transaction id. Part of the
   * uniqueness key, so the same moment on the same entity is recorded once
   * however many times a webhook or cron replays it.
   */
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget. NEVER throws and NEVER rejects.
 *
 * Duplicates are expected rather than exceptional: the Linear webhook, the
 * eligibility cron and the admin retry button all re-run the same evaluation,
 * so the unique constraint is the dedupe and P2002 is a normal outcome.
 */
export async function recordActivationEvent(
  input: ActivationEventInput,
): Promise<void> {
  if (!input.userId) return;

  try {
    // Lazily imported so this module stays Prisma-free at load time and the
    // funnel helpers below remain testable without a DATABASE_URL — the same
    // technique as pii-audit.ts.
    const { default: prisma } = await import("@/lib/prisma");

    await prisma.activationEvent.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (error) {
    // P2002 means we already recorded this crossing, which is the point.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : null;
    if (code === "P2002") return;
    console.warn(
      `[activation] could not record ${input.kind} for ${input.userId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** Where one developer got to, as a set of the kinds they have crossed. */
export type ActivationProgress = Record<ActivationKind, boolean>;

export function emptyProgress(): ActivationProgress {
  return Object.fromEntries(
    ACTIVATION_KINDS.map((kind) => [kind, false]),
  ) as ActivationProgress;
}

/**
 * The funnel: how many developers reached each stage. Pure, so the shape is
 * testable without a database — callers pass rows they have already read.
 */
export function summariseFunnel(
  rows: { userId: string; kind: string }[],
): { kind: ActivationKind; developers: number }[] {
  const byKind = new Map<string, Set<string>>();
  for (const row of rows) {
    const seen = byKind.get(row.kind) ?? new Set<string>();
    seen.add(row.userId);
    byKind.set(row.kind, seen);
  }
  return ACTIVATION_KINDS.map((kind) => ({
    kind,
    developers: byKind.get(kind)?.size ?? 0,
  }));
}
