import type { LinearClient } from "@linear/sdk";
import sharp from "sharp";
import { getLinearToken } from "@/lib/linear";

export const PPT_ATTACHMENT_MAX_FILES = 8;
export const PPT_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const PPT_ATTACHMENT_MAX_TOTAL_SIZE = 30 * 1024 * 1024;

export const PPT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type PptAttachmentMimeType = (typeof PPT_ATTACHMENT_MIME_TYPES)[number];

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
  return mimeType.startsWith("image/");
}

export function isPptAttachmentPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

function detectPptAttachmentMimeType(
  buffer: Buffer,
): PptAttachmentMimeType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF") {
    return "application/pdf";
  }
  return null;
}

function cleanFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^\w .()-]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || "attachment";
}

async function normalizeAttachmentFile(file: File) {
  const original = Buffer.from(await file.arrayBuffer());
  const mimeType = detectPptAttachmentMimeType(original);
  if (!mimeType) {
    throw new Error("Only JPEG, PNG, WebP, and PDF files are accepted");
  }

  if (original.length > PPT_ATTACHMENT_MAX_FILE_SIZE) {
    throw new Error("Each attachment must be under 10 MB");
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
): Promise<UploadedPptAttachment> {
  const normalized = await normalizeAttachmentFile(file);
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

export async function fetchLinearAsset(assetUrl: string, userId: string) {
  const token =
    process.env.LINEAR_SERVICE_API_KEY ?? (await getLinearToken(userId));
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(assetUrl, {
    headers,
    cache: "no-store",
  });
}
