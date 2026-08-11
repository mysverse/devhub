/**
 * Small-file upload path ("proxy"): the browser POSTs the bytes here and this
 * route forwards them to Linear under the user's OAuth token.
 *
 * Anything over `PROXY_MAX_BYTES` cannot reach a serverless function at all —
 * Vercel rejects the request body before the handler runs — so large files go
 * browser → Vercel Blob → `/api/ppt-attachments/relay` instead. The client
 * picks the transport by size, but nothing here trusts that choice: the size
 * ceiling, the authorization check and the type sniff all run again on what
 * actually arrived.
 */

import { NextResponse } from "next/server";
import {
  ATTACHMENT_SURFACE,
  attachmentErrorResponse,
  jsonError,
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
  PROXY_MAX_BYTES,
} from "@/lib/ppt-attachment-policy";
import {
  assertCanAttachToIssue,
  checkAttachmentRateLimits,
  recordUploadedAttachment,
} from "@/lib/ppt-comment-attachments";
import { uploadPptAttachmentToLinear } from "@/lib/ppt-request-attachments";

/**
 * Preflight for the relay transport: "would an upload be accepted right now?"
 *
 * The Vercel Blob browser SDK throws away the status, body and headers of any
 * non-2xx from the client-token route (`retrieveClientToken` raises a bare
 * "Failed to retrieve the client token"), so a rate-limited or reauth-needed
 * developer dragging a large file would otherwise see that instead of the
 * message we carefully wrote. The client calls this on the failure path to
 * recover the real reason, which means the common case pays nothing.
 */
export async function GET(req: Request) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = new URL(req.url).searchParams;
  const issueId = stringField(params.get("issueId"));
  if (!issueId) return jsonError("Missing issue");

  try {
    await assertCanAttachToIssue(userId, issueId);
    const rateLimit = await checkAttachmentRateLimits(userId);
    if (rateLimit.limited) {
      return rateLimitedResponse(rateLimit.scope, rateLimit.retryAfterSeconds);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return attachmentErrorResponse("preflight", error);
  }
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) return jsonError("Unauthorized", 401);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Invalid form data");
  }

  const issueId = stringField(formData.get("issueId"));
  if (!issueId) return jsonError("Missing issue");

  const kind = parseAttachmentKind(formData.get("kind"));
  if (!kind) return jsonError("Invalid attachment kind");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("No file was uploaded");
  }
  // The form also carries a `mimeType` field. It is deliberately never read:
  // the type is derived from the file's own leading bytes below, and taking
  // the client's word for it is exactly how a mislabelled payload would get
  // stored on Linear under a type reviewers trust.

  try {
    await assertCanAttachToIssue(userId, issueId);

    const rateLimit = await checkAttachmentRateLimits(userId);
    if (rateLimit.limited) {
      return rateLimitedResponse(rateLimit.scope, rateLimit.retryAfterSeconds);
    }

    // Measured from the bytes that arrived, not from anything the client
    // declared, so a large file cannot claim its way past the gateway limit.
    // Dev mode lifts the ceiling because `next dev` has no body cap in front
    // of the handler and large uploads must stay exercisable locally — the
    // flag is server-side only (`DEV_MODE`), so production is not bypassable.
    if (file.size > PROXY_MAX_BYTES && !isDevMode()) {
      return jsonError(
        `${file.name} is ${formatFileSize(file.size)} — files over ` +
          `${formatFileSize(PROXY_MAX_BYTES)} must use the relay upload.`,
        413,
      );
    }

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
      // `sharp` measures images server-side and that number wins. Video and
      // PDF have no server-side measurement, so the browser's numbers are the
      // only ones there are — they only drive poster aspect ratios, never a
      // decision, which is why a wrong hint is survivable.
      width: uploaded.width ?? parseDimension(formData.get("width")),
      height: uploaded.height ?? parseDimension(formData.get("height")),
      linearAssetUrl: uploaded.linearAssetUrl,
      // "dev" records that this file only fit because the local dev server has
      // no gateway in front of it; it would have needed the relay in prod.
      transport: isDevMode() && file.size > PROXY_MAX_BYTES ? "dev" : "proxy",
    });

    return NextResponse.json({ attachment });
  } catch (error) {
    return attachmentErrorResponse("Proxy upload", error);
  }
}
