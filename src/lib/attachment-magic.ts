/**
 * Magic-byte sniffing for uploaded attachments, isomorphic by construction.
 *
 * Deliberately free of `Buffer`, `sharp`, and every node builtin so the exact
 * same detection runs in three places: the browser (pre-flight, before we ask
 * the server for anything), the upload route (the authoritative check on real
 * bytes), and the legacy PPT-request path.
 *
 * A browser-supplied `File.type` is attacker- and OS-controlled and is never
 * trusted anywhere in this pipeline — it exists only to populate the file
 * picker's filter.
 */

import type { AttachmentMimeType } from "@/lib/ppt-attachment-policy";

/**
 * How many leading bytes a caller must read for {@link sniffAttachmentMimeType}
 * to decide. 32 covers the longest signature we check — an ISO base media
 * `ftyp` box plus its major brand.
 */
export const ATTACHMENT_SNIFF_BYTES = 32;

function ascii(bytes: Uint8Array, from: number, to: number) {
  let out = "";
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * ISO base media brands we accept as video. `M4A `/`M4B ` are audio-only and
 * must be rejected — which is why this checks the brand at bytes 8-12 rather
 * than stopping at the `ftyp` box, as a naive check would.
 */
const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "mmp4",
  "M4V ",
  "M4VH",
  "M4VP",
  "dash",
]);

/**
 * Returns the real type of a file from its leading bytes, or null when the
 * signature is unrecognised. Pass at least {@link ATTACHMENT_SNIFF_BYTES}.
 */
export function sniffAttachmentMimeType(
  bytes: Uint8Array,
): AttachmentMimeType | null {
  // JPEG — SOI marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG — 8-byte signature; the first four are enough to disambiguate.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";

  // WebP — RIFF container with a WEBP form type.
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "%PDF") {
    return "application/pdf";
  }

  // ISO base media (MP4 / QuickTime). The box-size prefix varies, so the
  // signature lives at offset 4, and the brand that follows decides which.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (MP4_BRANDS.has(brand)) return "video/mp4";
    return null;
  }

  // EBML header. This also matches Matroska (.mkv), which we accept as WebM:
  // distinguishing them means parsing the EBML DocType element, and Linear
  // stores whatever content type we declare either way.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";

  return null;
}

/**
 * Strips a filename down to something safe to hand to object storage and to
 * interpolate into markdown, without losing enough to be unrecognisable.
 */
export function cleanFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^\w .()-]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || "attachment";
}

const EXTENSIONS: Record<AttachmentMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extensionForMimeType(mimeType: AttachmentMimeType) {
  return EXTENSIONS[mimeType];
}

/**
 * Re-points a filename's extension at its real type. Used after the browser
 * re-encodes an image (`photo.jpg` → `photo.webp`) so what Linear stores and
 * what the reviewer downloads agree.
 */
export function retypeFilename(name: string, mimeType: AttachmentMimeType) {
  const extension = extensionForMimeType(mimeType);
  const cleaned = cleanFilename(name);
  const stem = cleaned.replace(/\.[^.]{1,12}$/, "");
  return `${stem || "attachment"}.${extension}`;
}

/**
 * Convenience for the browser pre-flight: reads only the leading bytes rather
 * than pulling a 25 MB video into memory to look at four of them.
 */
export async function sniffBlob(
  blob: Blob,
): Promise<AttachmentMimeType | null> {
  const head = await blob.slice(0, ATTACHMENT_SNIFF_BYTES).arrayBuffer();
  return sniffAttachmentMimeType(new Uint8Array(head));
}
