/**
 * Browser half of the PPT comment attachment upload.
 *
 * Two transports, chosen by size, never by the caller:
 *
 * - **proxy** (<= 4 MB): one multipart POST to our route, which uploads to
 *   Linear server-side. One round trip, and the server sees the real bytes.
 * - **relay** (> 4 MB): Vercel rejects serverless request bodies over 4.5 MB
 *   before the function runs, and Linear's CSP blocks browser-origin uploads
 *   to its own storage — so large files go to Vercel Blob from the browser,
 *   and our server relays them on to Linear and deletes the blob.
 *
 * The server never trusts the transport the client picked: the proxy route
 * enforces its own size ceiling, and every upload is re-authorized and
 * re-sniffed from the actual bytes.
 */

import { upload } from "@vercel/blob/client";
import { retypeFilename, sniffBlob } from "@/lib/attachment-magic";
import { normalizeImageInBrowser } from "@/lib/image-normalize-client";
import {
  type AttachmentTransport,
  categoryForMimeType,
  formatFileSize,
  maxBytesFor,
  transportForSize,
} from "@/lib/ppt-attachment-policy";

export type AttachmentKind = "progress" | "proof";

/** What the server returns once bytes are on Linear. Ids only — never URLs. */
export type UploadedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
};

export class AttachmentUploadError extends Error {
  readonly retryable: boolean;
  readonly reauth: boolean;

  constructor(
    message: string,
    options: { retryable?: boolean; reauth?: boolean } = {},
  ) {
    super(message);
    this.name = "AttachmentUploadError";
    this.retryable = options.retryable ?? true;
    this.reauth = options.reauth ?? false;
  }
}

type ErrorBody = { error?: string; reauth?: boolean };

async function readError(response: Response): Promise<AttachmentUploadError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  const message = body.error || `Upload failed (${response.status})`;

  if (
    response.status === 401 &&
    (body.reauth || body.error === "reauth_required")
  ) {
    return new AttachmentUploadError(message, {
      retryable: false,
      reauth: true,
    });
  }
  // 4xx other than 429 means the file or the request is wrong; retrying the
  // same bytes would fail identically.
  const retryable = response.status === 429 || response.status >= 500;
  return new AttachmentUploadError(message, { retryable });
}

/**
 * POSTs bytes through our own route with real upload progress.
 *
 * XHR rather than fetch: fetch cannot report upload progress without a
 * streaming request body plus `duplex: "half"`, which Safari does not support.
 * XHR also distinguishes a network/CORS failure (status 0) from an HTTP error.
 */
function postWithProgress(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal: AbortSignal | undefined,
): Promise<UploadedAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      const body = (xhr.response ?? {}) as ErrorBody & {
        attachment?: UploadedAttachment;
      };
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment) {
        onProgress(1);
        resolve(body.attachment);
        return;
      }
      const message = body.error || `Upload failed (${xhr.status})`;
      reject(
        new AttachmentUploadError(message, {
          retryable: xhr.status === 429 || xhr.status >= 500,
          reauth: xhr.status === 401 && Boolean(body.reauth),
        }),
      );
    };

    xhr.onerror = () =>
      reject(
        new AttachmentUploadError(
          "Upload failed — check your connection and try again.",
        ),
      );
    xhr.onabort = () =>
      reject(
        new AttachmentUploadError("Upload cancelled", { retryable: false }),
      );

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

/**
 * Recovers the real reason a relay upload was refused.
 *
 * Falls back to the SDK's own message if the preflight cannot say anything
 * useful — a vague error beats swallowing the failure.
 */
async function explainRelayFailure(
  issueId: string,
  original: unknown,
): Promise<AttachmentUploadError> {
  try {
    const response = await fetch(
      `/api/ppt-attachments?issueId=${encodeURIComponent(issueId)}`,
    );
    if (!response.ok) return await readError(response);
  } catch {
    // Network failure while asking — fall through to the generic message.
  }

  const message =
    original instanceof Error && original.message
      ? original.message
      : "Upload failed";
  return new AttachmentUploadError(message);
}

export type UploadOptions = {
  issueId: string;
  kind: AttachmentKind;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Normalizes, validates and uploads one file, resolving to the server-side row
 * id the composer will hand back when it posts the comment.
 *
 * The type is derived from the file's real leading bytes. `File.type` comes
 * from a filename extension and is trivially spoofed, so it is never consulted
 * here — only to pre-filter the picker.
 */
export async function uploadAttachment(
  original: File,
  options: UploadOptions,
): Promise<UploadedAttachment> {
  const { issueId, kind, signal } = options;
  const onProgress = options.onProgress ?? (() => {});

  const sniffed = await sniffBlob(original);
  if (!sniffed) {
    throw new AttachmentUploadError(
      `${original.name} isn't a supported file type.`,
      { retryable: false },
    );
  }

  const normalized = await normalizeImageInBrowser(original, sniffed);
  const file = normalized.changed
    ? normalized.file
    : new File([original], retypeFilename(original.name, sniffed), {
        type: sniffed,
        lastModified: original.lastModified,
      });
  const mimeType = normalized.mimeType;

  const limit = maxBytesFor(mimeType);
  if (file.size > limit) {
    const label = categoryForMimeType(mimeType) ?? "file";
    throw new AttachmentUploadError(
      `${file.name} is ${formatFileSize(file.size)} — ${label}s must be under ${formatFileSize(limit)}.`,
      { retryable: false },
    );
  }

  const transport: AttachmentTransport = transportForSize(file.size);

  if (transport === "proxy") {
    const form = new FormData();
    form.set("issueId", issueId);
    form.set("kind", kind);
    form.set("mimeType", mimeType);
    form.set("width", String(normalized.width ?? ""));
    form.set("height", String(normalized.height ?? ""));
    form.set("file", file, file.name);
    return postWithProgress("/api/ppt-attachments", form, onProgress, signal);
  }

  // Relay. The blob is a short-lived staging area: the server fetches it,
  // forwards it to Linear, and deletes it. `multipart: false` keeps the SDK on
  // a single non-streamed PUT, which the dev-mode blob mock can serve.
  let blob: { url: string };
  try {
    blob = await upload(`ppt-attachments/${issueId}/${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/ppt-attachments/blob-token",
      clientPayload: JSON.stringify({ issueId, kind }),
      multipart: false,
      contentType: mimeType,
      onUploadProgress: ({ percentage }) => onProgress(percentage / 100),
      abortSignal: signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new AttachmentUploadError("Upload cancelled", { retryable: false });
    }
    // The SDK discards the status, body and headers of any non-2xx from our
    // token route, so "rate limited" and "reconnect Linear" both arrive here as
    // a bare "Failed to retrieve the client token". Ask the server why.
    throw await explainRelayFailure(issueId, error);
  }

  const response = await fetch("/api/ppt-attachments/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      issueId,
      kind,
      filename: file.name,
      mimeType,
      byteSize: file.size,
      width: normalized.width,
      height: normalized.height,
    }),
    signal,
  });

  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { attachment: UploadedAttachment };
  return body.attachment;
}

/**
 * Discards an uploaded attachment that never made it into a comment.
 * Fire-and-forget: the retention sweep collects anything this misses.
 */
export function discardAttachment(id: string): void {
  void fetch(`/api/ppt-attachments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
}
