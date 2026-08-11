/**
 * Issues a scoped, short-lived Vercel Blob client token so a large attachment
 * can go browser → Blob directly, sidestepping the 4.5 MB serverless request
 * body cap that `/api/ppt-attachments` lives under.
 *
 * This is the only point at which a relayed upload can be refused: once the
 * token is out, the browser talks to Vercel Blob without us. So every check
 * the proxy route makes — session, issue authorization, rate limit, allowed
 * types, size — is made here too, and the token itself carries the narrowest
 * grant that still works.
 */

import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  ATTACHMENT_SURFACE,
  jsonError,
  MAX_ATTACHMENT_BYTES,
  parseClientPayload,
  rateLimitMessage,
} from "@/app/api/ppt-attachments/shared";
import { getSession } from "@/lib/auth-utils";
import { mimeTypesForSurface } from "@/lib/ppt-attachment-policy";
import {
  AttachmentAuthorizationError,
  assertCanAttachToIssue,
  checkAttachmentRateLimits,
} from "@/lib/ppt-comment-attachments";

/**
 * A refusal raised inside `onBeforeGenerateToken`, carrying the status it
 * should surface as. `handleUpload` rethrows whatever the callback throws, so
 * this is how the 401/429 distinction survives the trip back out.
 */
class TokenRefusedError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "TokenRefusedError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function POST(req: Request) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return jsonError("Invalid upload request");
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { userId } = await getSession();
        if (!userId) throw new TokenRefusedError("Unauthorized", 401);

        const payload = parseClientPayload(clientPayload);
        if (!payload)
          throw new TokenRefusedError("Invalid upload request", 400);

        // Same predicate the comment-posting action applies, so a token is
        // never issued for a file that would then be refused at post time.
        await assertCanAttachToIssue(userId, payload.issueId);

        const rateLimit = await checkAttachmentRateLimits(userId);
        if (rateLimit.limited) {
          throw new TokenRefusedError(
            rateLimitMessage(rateLimit.scope),
            429,
            rateLimit.retryAfterSeconds,
          );
        }

        return {
          // Blob enforces these itself, before a byte is stored — the relay
          // re-checks the real bytes afterwards, but this is what stops an
          // oversized or unsupported file being uploaded at all.
          allowedContentTypes: mimeTypesForSurface(ATTACHMENT_SURFACE),
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          // Two people attaching `screenshot.png` to the same issue must not
          // overwrite each other, and a predictable path would let a third
          // party guess at staged bytes.
          addRandomSuffix: true,
          // A breadcrumb for debugging, not an authorization token: the relay
          // never reads it, and re-derives the user, issue and kind from the
          // caller's own session and request instead.
          tokenPayload: JSON.stringify({
            userId,
            issueId: payload.issueId,
            kind: payload.kind,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Intentionally does nothing.
        //
        // Vercel Blob POSTs this callback from its own infrastructure, so it
        // never fires against localhost and cannot be exercised in dev mode at
        // all. It also proves nothing about the bytes — it reports that *a*
        // blob landed at a path, with no re-sniff and no session behind it.
        //
        // The real completion signal is the browser's explicit POST to
        // /api/ppt-attachments/relay, which re-authenticates the uploader,
        // fetches the bytes, re-derives their type, forwards them to Linear
        // and only then creates the row. Nothing load-bearing may move here
        // without breaking dev mode and weakening that check.
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TokenRefusedError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    if (error instanceof AttachmentAuthorizationError) {
      return jsonError(error.message, 403);
    }
    console.error("[ppt-attachments] Blob token issue failed:", error);
    return jsonError(
      error instanceof Error ? error.message : "Could not start the upload",
      400,
    );
  }
}
