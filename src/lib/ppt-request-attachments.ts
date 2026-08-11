import type { LinearClient } from "@linear/sdk";
import sharp from "sharp";
import {
  ATTACHMENT_SNIFF_BYTES,
  cleanFilename,
  sniffAttachmentMimeType,
} from "@/lib/attachment-magic";
import { getLinearToken } from "@/lib/linear";
import {
  ATTACHMENT_MAX_FILES,
  type AttachmentMimeType,
  categoryForMimeType,
  isAttachmentImage,
  maxBytesFor,
  maxTotalBytesForSurface,
  mimeTypesForSurface,
} from "@/lib/ppt-attachment-policy";

// This module pulls in `sharp`, so a client component can never import it.
// The limits and the sniffer therefore live in client-safe modules and are
// re-exported here for the server-side callers that already reference them.
export const PPT_ATTACHMENT_MAX_FILES = ATTACHMENT_MAX_FILES;
export const PPT_ATTACHMENT_MAX_TOTAL_SIZE =
  maxTotalBytesForSurface("ppt-request");
export const PPT_ATTACHMENT_MIME_TYPES = mimeTypesForSurface("ppt-request");

export type PptAttachmentMimeType = AttachmentMimeType;

export type UploadedPptAttachment = {
  filename: string;
  mimeType: PptAttachmentMimeType;
  byteSize: number;
  width: number | null;
  height: number | null;
  linearAssetUrl: string;
};

type LinearUploadHeader = {
  key?: string | null;
  value?: string | null;
};

type LinearUploadFile = {
  uploadUrl?: string | null;
  assetUrl?: string | null;
  headers?: LinearUploadHeader[] | null;
};

type LinearUploadPayload = {
  success?: boolean;
  uploadFile?: LinearUploadFile | null;
};

export function isPptAttachmentImage(mimeType: string) {
  return isAttachmentImage(mimeType);
}

export function isPptAttachmentPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

/**
 * Normalizes an uploaded file for storage, refusing anything whose real bytes
 * disagree with what it claims to be. `file.type` is never consulted — it is
 * set by the browser from a filename extension and is trivially spoofed.
 *
 * `allowedMimeTypes` scopes a caller to its own surface: the PPT request form
 * has no reason to accept video even though the sniffer recognises it.
 */
async function normalizeAttachmentFile(
  file: File,
  allowedMimeTypes: readonly string[],
) {
  const original = Buffer.from(await file.arrayBuffer());
  const head = new Uint8Array(
    original.buffer,
    original.byteOffset,
    Math.min(original.length, ATTACHMENT_SNIFF_BYTES),
  );
  const mimeType = sniffAttachmentMimeType(head);
  if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
    throw new Error("That file type isn't supported");
  }

  const limit = maxBytesFor(mimeType);
  if (original.length > limit) {
    const label = categoryForMimeType(mimeType) ?? "file";
    throw new Error(
      `Each ${label} must be under ${Math.round(limit / (1024 * 1024))} MB`,
    );
  }

  if (!isPptAttachmentImage(mimeType)) {
    return {
      buffer: original,
      mimeType,
      filename: cleanFilename(file.name),
      width: null,
      height: null,
    };
  }

  const pipeline = sharp(original).rotate();
  const metadata = await pipeline.metadata();
  const buffer = await pipeline.toBuffer();
  return {
    buffer,
    mimeType,
    filename: cleanFilename(file.name),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

function headersForLinearUpload(
  contentType: string,
  returnedHeaders: LinearUploadHeader[] | null | undefined,
) {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000");
  for (const header of returnedHeaders ?? []) {
    if (header.key && header.value) {
      headers.set(header.key, header.value);
    }
  }
  return headers;
}

export async function uploadPptAttachmentToLinear(
  linearClient: LinearClient,
  file: File,
  allowedMimeTypes: readonly string[] = PPT_ATTACHMENT_MIME_TYPES,
): Promise<UploadedPptAttachment> {
  const normalized = await normalizeAttachmentFile(file, allowedMimeTypes);
  const payload = (await linearClient.fileUpload(
    normalized.mimeType,
    normalized.filename,
    normalized.buffer.length,
  )) as LinearUploadPayload;

  const uploadFile = payload.uploadFile;
  if (!payload.success || !uploadFile?.uploadUrl || !uploadFile.assetUrl) {
    throw new Error("Linear could not prepare the attachment upload");
  }

  const response = await fetch(uploadFile.uploadUrl, {
    method: "PUT",
    headers: headersForLinearUpload(normalized.mimeType, uploadFile.headers),
    body: normalized.buffer as unknown as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Linear attachment upload failed (${response.status})`);
  }

  return {
    filename: normalized.filename,
    mimeType: normalized.mimeType,
    byteSize: normalized.buffer.length,
    width: normalized.width,
    height: normalized.height,
    linearAssetUrl: uploadFile.assetUrl,
  };
}

/**
 * Fetches a Linear-hosted asset with whatever credentials are available.
 *
 * `init` is merged over the authorization header so callers can add a `Range` —
 * the post-upload verifier reads the first 32 bytes of a file to confirm its
 * magic bytes, and pulling a 25 MB video into a serverless function to look at
 * four of them is not an option.
 */
export async function fetchLinearAsset(
  assetUrl: string,
  userId: string,
  init?: RequestInit,
) {
  const token =
    process.env.LINEAR_SERVICE_API_KEY ?? (await getLinearToken(userId));
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(assetUrl, {
    ...init,
    headers,
    cache: "no-store",
  });
}
