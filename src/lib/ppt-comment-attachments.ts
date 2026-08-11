import type { PptCommentAttachmentKind } from "@prisma/client";
import {
  attachmentMarkdown,
  type MarkdownAttachment,
} from "@/lib/attachment-markdown";
import prisma from "@/lib/prisma";

/**
 * Server-side ownership of PPT comment attachments.
 *
 * The invariant this module exists to hold: **the client never sends a URL to
 * a comment-posting path.** It sends the ids of rows it uploaded, and the
 * server resolves the URLs from its own table. A replayed id, another user's
 * id, or an id for a different issue therefore resolves to nothing rather than
 * putting an attacker-chosen URL into a Linear comment — which would be stored
 * content injection into a third party outside DevHub's retention control.
 */

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const DEFAULT_MAX_UPLOADS_PER_HOUR = 60;
const DEFAULT_MAX_BYTES_PER_HOUR = 300 * 1024 * 1024;

/** Mirrors getHourlyLimit in src/lib/llm.ts; 0 disables the scope. */
function envLimit(name: string, fallback: number) {
  const configured = Number(process.env[name] ?? String(fallback));
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return Math.floor(configured);
}

export type AttachmentRateLimitScope = "count" | "bytes";

export type AttachmentRateLimitResult =
  | { limited: false }
  | {
      limited: true;
      scope: AttachmentRateLimitScope;
      retryAfterSeconds: number;
    };

/**
 * Rolling-hour cap on uploads, using the attachment rows as their own ledger —
 * the same shape as `checkLlmRateLimits` (src/lib/llm.ts) and
 * `checkEmailRateLimits` (src/lib/email.ts). No Redis, and it works unchanged
 * under dev mock.
 *
 * Only successful uploads are counted, since a row exists only when bytes
 * reached Linear. A caller burning attempts on failures is bounded instead by
 * the per-file size caps and by needing an active assignment on the issue.
 */
export async function checkAttachmentRateLimits(
  userId: string,
): Promise<AttachmentRateLimitResult> {
  const countLimit = envLimit(
    "PPT_ATTACHMENT_MAX_UPLOADS_PER_HOUR",
    DEFAULT_MAX_UPLOADS_PER_HOUR,
  );
  const byteLimit = envLimit(
    "PPT_ATTACHMENT_MAX_BYTES_PER_HOUR",
    DEFAULT_MAX_BYTES_PER_HOUR,
  );
  if (countLimit === 0 && byteLimit === 0) return { limited: false };

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await prisma.pptCommentAttachment.aggregate({
    where: { uploadedById: userId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { byteSize: true },
  });

  // Retry-After is the full window: the oldest row's age is not tracked here,
  // and over-promising a shorter wait would just produce another 429.
  const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

  if (countLimit > 0 && recent._count._all >= countLimit) {
    return { limited: true, scope: "count", retryAfterSeconds };
  }
  if (byteLimit > 0 && (recent._sum.byteSize ?? 0) >= byteLimit) {
    return { limited: true, scope: "bytes", retryAfterSeconds };
  }
  return { limited: false };
}

export class AttachmentAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentAuthorizationError";
  }
}

/**
 * Whether this user may attach to this issue.
 *
 * Same predicate `submitPptProgress` applies before posting
 * (src/app/dashboard/ppts/actions.ts), so an upload can never be authorized
 * for a comment that will then be refused. DB-only — no Linear round trip.
 */
export async function assertCanAttachToIssue(
  userId: string,
  linearIssueId: string,
): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { linearId: true },
  });
  if (!profile?.linearId) {
    throw new AttachmentAuthorizationError(
      "Link your Linear account before attaching files.",
    );
  }

  const watch = await prisma.pptAssignmentWatch.findUnique({
    where: {
      linearIssueId_assigneeLinearId: {
        linearIssueId,
        assigneeLinearId: profile.linearId,
      },
    },
    select: { status: true },
  });
  if (!watch || watch.status === "UNASSIGNED" || watch.status === "RESOLVED") {
    throw new AttachmentAuthorizationError(
      "This PPT is not currently watched as your assignment.",
    );
  }
}

export type RecordedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
};

export async function recordUploadedAttachment(input: {
  userId: string;
  linearIssueId: string;
  kind: PptCommentAttachmentKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  linearAssetUrl: string;
  transport: string;
}): Promise<RecordedAttachment> {
  const row = await prisma.pptCommentAttachment.create({
    data: {
      linearIssueId: input.linearIssueId,
      uploadedById: input.userId,
      kind: input.kind,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      linearAssetUrl: input.linearAssetUrl,
      transport: input.transport,
    },
    select: { id: true, filename: true, mimeType: true, byteSize: true },
  });
  return row;
}

export type ClaimedAttachments = {
  rows: MarkdownAttachment[];
  markdown: string;
  ids: string[];
};

/** Rolls the claim transaction back when not every requested row was claimable. */
class PartialClaimError extends Error {}

/**
 * Atomically claims the caller's uploaded attachments for a comment about to
 * be posted, and returns the markdown to append.
 *
 * The claim is an all-or-nothing compare-and-set: rows move UPLOADED -> POSTED
 * scoped to this user, this issue and this kind. If the number updated does not
 * match what was asked for, the caller is claiming rows it
 * does not own, rows already spent, or rows that do not exist — every one of
 * which is a bug or an attack, so it fails loudly instead of silently posting
 * a partial set. It also makes a double submit safe: the second one claims
 * zero.
 *
 * Rows are marked POSTED *before* the comment exists, so `releaseAttachmentClaim`
 * must run if posting then fails. That ordering is deliberate — the alternative
 * (claim after posting) leaves a window where two concurrent submits both
 * succeed and the same attachment lands in two comments.
 */
export async function claimAttachmentsForComment(input: {
  userId: string;
  linearIssueId: string;
  kind: PptCommentAttachmentKind;
  attachmentIds: string[];
}): Promise<ClaimedAttachments | { error: string }> {
  const ids = [...new Set(input.attachmentIds)].filter(Boolean);
  if (ids.length === 0) return { rows: [], markdown: "", ids: [] };

  const scope = {
    id: { in: ids },
    uploadedById: input.userId,
    linearIssueId: input.linearIssueId,
    kind: input.kind,
  } as const;

  // The claim and its all-or-nothing check run in one transaction so a partial
  // claim is rolled back by the database rather than compensated for afterwards.
  //
  // Compensating by hand is what would go wrong: an "un-claim everything in
  // scope with a null linearCommentId" cleanup cannot tell rows THIS call just
  // claimed from rows a concurrent submit by the same user on the same issue
  // legitimately claimed a millisecond earlier — so it would hand the other
  // caller's attachments back while its comment was already being posted.
  let found: (MarkdownAttachment & { id: string })[];
  try {
    found = await prisma.$transaction(async (tx) => {
      const claimed = await tx.pptCommentAttachment.updateMany({
        where: { ...scope, status: "UPLOADED" as const },
        data: { status: "POSTED" as const },
      });
      if (claimed.count !== ids.length) throw new PartialClaimError();

      return tx.pptCommentAttachment.findMany({
        where: scope,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          byteSize: true,
          linearAssetUrl: true,
        },
      });
    });
  } catch (error) {
    if (error instanceof PartialClaimError) {
      return {
        error:
          "Some attachments are no longer available. Remove them and try again.",
      };
    }
    throw error;
  }

  // Order by the caller's `ids` array, not by any database column.
  //
  // `ids` is the order the developer arranged the tray in. Sorting by
  // sortOrder/createdAt instead would order by upload *completion*: uploads run
  // in parallel, and a 200 KB screenshot on the fast proxy path finishes before
  // a 20 MB clip that went through the relay — so a before/after pair would
  // routinely post as after/before.
  const byId = new Map(found.map((row) => [row.id, row]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((row): row is (typeof found)[number] => row !== undefined);

  return {
    rows,
    markdown: attachmentMarkdown(rows),
    ids: rows.map((row) => row.id),
  };
}

/** Stamps the comment a claim ended up in. Called only after it provably exists. */
export async function markAttachmentsPosted(
  ids: string[],
  linearCommentId: string | null,
): Promise<void> {
  if (ids.length === 0) return;
  await prisma.pptCommentAttachment.updateMany({
    where: { id: { in: ids } },
    data: { linearCommentId, postedAt: new Date() },
  });
}

/** Undoes a claim when the comment post failed, so the user can retry for free. */
export async function releaseAttachmentClaim(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.pptCommentAttachment.updateMany({
    where: { id: { in: ids }, linearCommentId: null },
    data: { status: "UPLOADED" as const },
  });
}
