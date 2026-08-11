/**
 * Plumbing shared by the four PPT comment attachment routes.
 *
 * It lives beside the routes rather than in `src/lib` because none of it is
 * policy: it is request parsing and HTTP status shaping. What may be attached
 * and how big it may be lives in `src/lib/ppt-attachment-policy.ts`; who may
 * attach and what gets recorded lives in `src/lib/ppt-comment-attachments.ts`.
 * Next only treats specially-named files in `app/` as routes, so a plain
 * module here is not reachable over HTTP.
 */

import type { PptCommentAttachmentKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { sniffBlob } from "@/lib/attachment-magic";
import { LinearReauthRequiredError } from "@/lib/linear";
import {
  type AttachmentMimeType,
  type AttachmentSurface,
  checkAttachmentSelection,
  maxBytesFor,
  mimeTypesForSurface,
} from "@/lib/ppt-attachment-policy";
import {
  AttachmentAuthorizationError,
  type AttachmentRateLimitScope,
} from "@/lib/ppt-comment-attachments";

/** Everything under this route family attaches to a progress/proof comment. */
export const ATTACHMENT_SURFACE: AttachmentSurface = "ppt-comment";

/**
 * The largest single file any of these routes will accept, i.e. the most
 * permissive category cap on this surface. Used as the Vercel Blob token's
 * `maximumSizeInBytes` and as the relay's buffering ceiling — the per-type cap
 * is stricter and is enforced once the real type is known.
 */
export const MAX_ATTACHMENT_BYTES = Math.max(
  ...mimeTypesForSurface(ATTACHMENT_SURFACE).map(maxBytesFor),
);

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * The one error body the browser client treats specially: it stops offering a
 * retry and sends the user to relink Linear instead. Shape copied from
 * `src/app/api/ppt-requests/route.ts`.
 */
export function reauthResponse() {
  return NextResponse.json(
    { error: "reauth_required", reauth: true },
    { status: 401 },
  );
}

const KINDS: Record<string, PptCommentAttachmentKind> = {
  progress: "PROGRESS",
  proof: "PROOF",
};

/**
 * Maps the wire value the composer sends ("progress"/"proof") onto the Prisma
 * enum. Returns null for anything else rather than defaulting, so a typo lands
 * as a 400 instead of quietly filing proof under progress.
 */
export function parseAttachmentKind(
  value: unknown,
): PptCommentAttachmentKind | null {
  return typeof value === "string" ? (KINDS[value] ?? null) : null;
}

/** Trims a form/JSON field to a string, or "" when it is absent or non-string. */
export function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The `clientPayload` the browser attaches to a Vercel Blob upload:
 * `JSON.stringify({issueId, kind})`. It is attacker-controlled — the token
 * route re-authorizes the issue it names rather than believing it.
 */
export function parseClientPayload(
  raw: string | null,
): { issueId: string; kind: PptCommentAttachmentKind } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { issueId?: unknown; kind?: unknown };
    const issueId = stringField(parsed.issueId);
    const kind = parseAttachmentKind(parsed.kind);
    return issueId && kind ? { issueId, kind } : null;
  } catch {
    return null;
  }
}

/**
 * Pixel dimensions measured in the browser. They arrive as numbers over JSON
 * and as (possibly empty) strings over multipart, and are only ever a hint —
 * see the call sites, which prefer the server-measured value when there is one.
 */
export function parseDimension(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function rateLimitMessage(scope: AttachmentRateLimitScope) {
  return scope === "count"
    ? "You've uploaded a lot of files in the past hour. Try again later."
    : "You've uploaded a lot of data in the past hour. Try again later.";
}

export function rateLimitedResponse(
  scope: AttachmentRateLimitScope,
  retryAfterSeconds: number,
) {
  return NextResponse.json(
    { error: rateLimitMessage(scope) },
    {
      status: 429,
      // The client retries on 429, so tell it when — without this it backs off
      // on its own schedule and burns another rejected round trip.
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/**
 * Rejects a file on its real leading bytes before any of it is forwarded.
 *
 * `uploadPptAttachmentToLinear` re-derives the type from the full buffer and
 * remains the authority; this runs first so an unsupported or oversized file
 * comes back as a 400 naming the file, rather than as a generic upstream
 * failure that the client would offer to retry forever. `File.type` is never
 * consulted — the browser sets it from a filename extension.
 */
export async function sniffAndValidate(
  file: File,
): Promise<{ mimeType: AttachmentMimeType } | { error: string }> {
  const mimeType = await sniffBlob(file);
  if (!mimeType) {
    return { error: `${file.name} isn't a supported file type.` };
  }
  const selectionError = checkAttachmentSelection(
    [{ name: file.name, size: file.size, type: mimeType }],
    ATTACHMENT_SURFACE,
  );
  return selectionError ?? { mimeType };
}

/**
 * Maps the errors an upload path can throw onto the statuses the browser
 * client keys off: 401 + `reauth` sends the user to relink Linear, other 4xx
 * are terminal, 5xx are offered a retry.
 *
 * Anything unrecognised is Linear or `sharp` refusing bytes that already
 * passed `sniffAndValidate`, which makes it an upstream failure rather than a
 * bad request — hence 502, which the client will retry.
 */
export function attachmentErrorResponse(context: string, error: unknown) {
  if (error instanceof LinearReauthRequiredError) return reauthResponse();
  if (error instanceof AttachmentAuthorizationError) {
    return jsonError(error.message, 403);
  }
  console.error(`[ppt-attachments] ${context} failed:`, error);
  return jsonError(
    error instanceof Error ? error.message : "Upload failed",
    502,
  );
}
