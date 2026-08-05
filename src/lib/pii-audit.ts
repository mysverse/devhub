/**
 * Audit trail for READS of the most sensitive PII. Every other audit model in
 * this codebase records mutations; nothing recorded that an admin opened
 * someone's government ID, selfie or bank details.
 */

export type PiiResource =
  | "KYC_ID_DOCUMENT"
  | "KYC_SELFIE"
  | "BANK_DETAILS"
  | "WELCOME_PACK_ADDRESS";

/** How long an identical (actor, resource, resourceId) read folds into one row. */
export const PII_AUDIT_DEDUPE_MINUTES = 5;

export type PiiAccessInput = {
  actorId: string;
  subjectId?: string | null;
  resource: PiiResource;
  resourceId?: string | null;
  context?: string;
  details?: string;
  headers?: Headers;
};

/** Best-effort client attribution. Absent behind some proxies; never required. */
export function requestOrigin(headers?: Headers) {
  if (!headers) return { ipAddress: null, userAgent: null };
  const forwarded = headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
  };
}

export function dedupeKeyFor(input: PiiAccessInput) {
  return `${input.actorId}:${input.resource}:${input.resourceId ?? ""}`;
}

/**
 * Fire-and-forget. NEVER throws and NEVER rejects.
 *
 * This is the single most important property in the module: it is called from
 * the KYC document route and the payout slip route, and an audit insert that
 * can throw would be a new way to fail serving a document — or, worse, to
 * break a payout. A missing audit row is a far smaller problem than that.
 */
export async function logPiiAccess(input: PiiAccessInput): Promise<void> {
  try {
    // Imported lazily so this module stays free of Prisma at load time, which
    // keeps the pure helpers above unit-testable without a DATABASE_URL.
    // Same technique as the cycle-breaking imports in payout.ts/incentives.ts.
    const { default: prisma } = await import("@/lib/prisma");

    // The KYC route serves an image: browser re-renders, retries and range
    // requests would otherwise flood the table with identical rows.
    const since = new Date(Date.now() - PII_AUDIT_DEDUPE_MINUTES * 60 * 1000);
    const recent = await prisma.piiAccessLog.findFirst({
      where: {
        actorId: input.actorId,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return;

    const { ipAddress, userAgent } = requestOrigin(input.headers);
    await prisma.piiAccessLog.create({
      data: {
        actorId: input.actorId,
        subjectId: input.subjectId ?? null,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        context: input.context ?? null,
        details: input.details ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("[pii-audit] Failed to record PII access:", error);
  }
}
