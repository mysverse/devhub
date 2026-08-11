/**
 * Large-file upload path, second half.
 *
 * The browser has already PUT the file to Vercel Blob with a token issued by
 * `/api/ppt-attachments/blob-token`; it then calls this route, which fetches
 * the staged bytes, forwards them to Linear, records the row and deletes the
 * blob. Vercel Blob is a staging area with a one-request lifetime, not
 * storage — the durable copy is the Linear asset.
 *
 * This is also the only place in the pipeline that fetches a URL the client
 * named, which is why `isAllowedBlobUrl` is load-bearing rather than tidiness.
 */

import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  ATTACHMENT_SURFACE,
  attachmentErrorResponse,
  jsonError,
  MAX_ATTACHMENT_BYTES,
  parseAttachmentKind,
  parseDimension,
  rateLimitedResponse,
  sniffAndValidate,
  stringField,
} from "@/app/api/ppt-attachments/shared";
import { getSession } from "@/lib/auth-utils";
import { isDevMode } from "@/lib/dev-mode";
import { withLinearFallback } from "@/lib/linear";
import {
  formatFileSize,
  mimeTypesForSurface,
} from "@/lib/ppt-attachment-policy";
import {
  assertCanAttachToIssue,
  checkAttachmentRateLimits,
  recordUploadedAttachment,
} from "@/lib/ppt-comment-attachments";
import { uploadPptAttachmentToLinear } from "@/lib/ppt-request-attachments";

/**
 * A 25 MB video makes two hops here (Blob → us → Linear) on a connection we do
 * not control, which is well past the 10 s a route handler gets by default.
 */
export const maxDuration = 300;

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const DEV_BLOB_PATH_PREFIX = "/api/dev/blob/";

/**
 * Our own Blob store's public hostname, derived from the read-write token.
 *
 * The token is `vercel_blob_rw_<storeId>_<secret>` and the public host is
 * `<storeId>.public.blob.vercel-storage.com`, lowercased. Matching the bare
 * `.public.blob.vercel-storage.com` suffix instead would accept EVERY Vercel
 * customer's public store: a caller could stage arbitrary bytes of arbitrary
 * size in a store they control and have us forward them into our Linear
 * workspace, bypassing every limit the blob token was supposed to impose.
 */
function ownBlobHostname(): string | null {
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

/**
 * Whether a URL is one this route is willing to fetch.
 *
 * Without this the endpoint is "authenticated user names a URL, the server
 * fetches it" — server-side request forgery against everything reachable from
 * the function's network, including cloud metadata endpoints, and an
 * exfiltration channel via the bytes that come back. An allowlist of the one
 * host we actually stage uploads on is the only safe shape.
 *
 * Dev mode additionally allows the in-memory mock, which hands back
 * `<app>/api/dev/blob/<pathname>` on loopback (see `src/dev/blob-server.ts`).
 * That is gated on the server-side `DEV_MODE` flag, never on anything a client
 * can assert.
 */
function isAllowedBlobUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  const own = ownBlobHostname();
  if (url.protocol === "https:" && own && url.hostname.toLowerCase() === own) {
    return true;
  }

  if (!isDevMode()) return false;
  try {
    const appOrigin = new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    ).origin;
    return (
      url.origin === appOrigin && url.pathname.startsWith(DEV_BLOB_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

type RelayBody = {
  blobUrl?: unknown;
  issueId?: unknown;
  kind?: unknown;
  filename?: unknown;
  width?: unknown;
  height?: unknown;
};

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  let body: RelayBody;
  try {
    body = (await req.json()) as RelayBody;
  } catch {
    return jsonError("Invalid request body");
  }

  const blobUrl = stringField(body.blobUrl);
  const issueId = stringField(body.issueId);
  const kind = parseAttachmentKind(body.kind);
  const filename = stringField(body.filename);

  if (!issueId) return jsonError("Missing issue");
  if (!kind) return jsonError("Invalid attachment kind");
  if (!filename) return jsonError("Missing filename");
  if (!isAllowedBlobUrl(blobUrl)) return jsonError("Unsupported upload URL");
  // The body also carries `mimeType` and `byteSize`. Both are ignored: the
  // type is re-derived from the staged bytes and the size is whatever actually
  // came back, so a lying client changes nothing about what gets stored.

  try {
    await assertCanAttachToIssue(userId, issueId);

    // Also checked in /blob-token, but that is not sufficient: the caller
    // reaches this route directly with any URL the allowlist accepts, so the
    // only gate that always runs is this one.
    const rateLimit = await checkAttachmentRateLimits(userId);
    if (rateLimit.limited) {
      return rateLimitedResponse(rateLimit.scope, rateLimit.retryAfterSeconds);
    }

    const upstream = await fetch(blobUrl);
    if (!upstream.ok) {
      return jsonError("The uploaded file could not be read back", 502);
    }

    // `Number(null)` is 0 — finite, and under any ceiling — so treating a
    // missing header as "unknown, carry on" would let an unbounded body into
    // the function heap before the post-read check could reject it. Our own
    // Blob store always sets it, so absence means something is wrong.
    const declaredHeader = upstream.headers.get("content-length");
    const declaredLength =
      declaredHeader === null ? NaN : Number(declaredHeader);
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
      return jsonError("The uploaded file could not be read back", 502);
    }
    if (declaredLength > MAX_ATTACHMENT_BYTES) {
      return jsonError(
        `${filename} is ${formatFileSize(declaredLength)} — the limit is ` +
          `${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
        413,
      );
    }

    // Buffered rather than streamed, deliberately. Linear hands back a
    // presigned PUT, and presigned URLs are signed over a Content-Length and
    // reject chunked transfer encoding — which is exactly what piping a
    // ReadableStream into `fetch` produces. The blob token caps the upload at
    // MAX_ATTACHMENT_BYTES, and the Content-Length check above catches a blob
    // that somehow exceeded it, so the buffer is bounded either way.
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return jsonError(
        `${filename} is ${formatFileSize(bytes.byteLength)} — the limit is ` +
          `${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
        413,
      );
    }

    // The content type here is only what Blob echoed back; `sniffAndValidate`
    // and `uploadPptAttachmentToLinear` both re-derive it from the bytes.
    const file = new File([bytes], filename, {
      type: upstream.headers.get("content-type") ?? "application/octet-stream",
    });

    const validated = await sniffAndValidate(file);
    if ("error" in validated) return jsonError(validated.error);

    const uploaded = await withLinearFallback(userId, (client) =>
      uploadPptAttachmentToLinear(
        client,
        file,
        mimeTypesForSurface(ATTACHMENT_SURFACE),
      ),
    );

    const attachment = await recordUploadedAttachment({
      userId,
      linearIssueId: issueId,
      kind,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
      byteSize: uploaded.byteSize,
      // `sharp` measures images; video has no server-side measurement, so the
      // browser's numbers are the only ones there are.
      width: uploaded.width ?? parseDimension(body.width),
      height: uploaded.height ?? parseDimension(body.height),
      linearAssetUrl: uploaded.linearAssetUrl,
      transport: "relay",
    });

    return NextResponse.json({ attachment });
  } catch (error) {
    return attachmentErrorResponse("Relay upload", error);
  } finally {
    // Best effort, and never allowed to change the outcome: the blob has no
    // other reader once we have the bytes, and failing a relay that already
    // reached Linear would make the user re-upload for nothing. Whatever this
    // misses is collected by Blob's own retention.
    await del(blobUrl).catch((error) => {
      console.error("[ppt-attachments] Failed to delete staged blob:", error);
    });
  }
}
