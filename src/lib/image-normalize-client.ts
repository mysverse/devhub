/**
 * Browser-side image normalization, run before an attachment is uploaded.
 *
 * This replaces what `sharp(buf).rotate()` does on the server for the PPT
 * request path — but it has to, rather than merely wanting to: attachments
 * over Vercel's 4.5 MB body cap never reach a serverless function, so a phone
 * photo has to be shrunk on the device or it cannot be posted at all.
 *
 * Two things fall out of doing it here:
 *
 * - A 4 MB phone screenshot becomes a ~300 KB WebP, so the upload finishes in
 *   one round trip on the fast path instead of going through the relay.
 * - Canvas re-encoding drops all metadata, which strips the GPS EXIF a phone
 *   camera writes into every JPEG. Proof screenshots should not carry the
 *   location of the person who took them.
 *
 * Videos and PDFs pass through byte-identical — transcoding video would need
 * WebCodecs and would invalidate the size the upload was authorized for.
 */

import { retypeFilename } from "@/lib/attachment-magic";
import {
  type AttachmentMimeType,
  categoryForMimeType,
} from "@/lib/ppt-attachment-policy";

export type NormalizeImageOptions = {
  /** Longest side, in px. 2560 keeps a 1440p screenshot pixel-exact. */
  maxDimension?: number;
  /** WebP quality. Below ~0.75, text in screenshots visibly rings. */
  quality?: number;
  /** PNG/WebP under this are left alone — re-encoding would only cost quality. */
  recompressAboveBytes?: number;
};

export type NormalizeReason =
  | "passthrough-not-image"
  | "passthrough-small"
  | "passthrough-unsupported-api"
  | "passthrough-larger-output"
  | "recompressed";

export type NormalizedImage = {
  /** The original File when nothing changed, otherwise a new one. */
  file: File;
  mimeType: AttachmentMimeType;
  width: number | null;
  height: number | null;
  changed: boolean;
  reason: NormalizeReason;
};

const DEFAULTS = {
  maxDimension: 2560,
  quality: 0.82,
  recompressAboveBytes: 512 * 1024,
} as const;

/** Longest side scaled to `maxDimension`, preserving aspect ratio. */
export function targetDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension || longest === 0) return { width, height };

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Whether a decoded image is worth re-encoding.
 *
 * JPEG is always re-encoded regardless of size, because it is the only format
 * a phone camera writes GPS EXIF into. Everything else only earns the quality
 * cost when it is genuinely large.
 */
export function shouldRecompress(
  mimeType: string,
  byteSize: number,
  width: number,
  height: number,
  options: NormalizeImageOptions = {},
): boolean {
  if (categoryForMimeType(mimeType) !== "image") return false;
  if (mimeType === "image/jpeg") return true;

  const { maxDimension, recompressAboveBytes } = { ...DEFAULTS, ...options };
  if (Math.max(width, height) > maxDimension) return true;
  return byteSize > recompressAboveBytes;
}

/**
 * A 459-byte JPEG stored 3 wide by 2 tall and tagged `Orientation=6`, which
 * means "rotate 90° clockwise to display". A decoder that honours the tag
 * reports the decoded bitmap as 2x3; one that ignores it reports 3x2.
 *
 * Generated with sharp and verified round-trip: `sharp(fixture).rotate()`
 * renders 2x3.
 */
const ORIENTATION_FIXTURE =
  "data:image/jpeg;base64,/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAMAAAADoAQAAQAAAAIAAAAAAAAA/9sAQwAUDg8SDw0UEhASFxUUGB4yIR4cHB49LC4kMklATEtHQEZFUFpzYlBVbVZFRmSIZW13e4GCgU5gjZeMfZZzfoF8/9sAQwEVFxceGh47ISE7fFNGU3x8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8/8AAEQgAAgADAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAF/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAQF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AngCrz//Z";

let orientationSupport: Promise<boolean> | null = null;

/**
 * Whether `createImageBitmap`'s `imageOrientation` option is honoured.
 *
 * This cannot be feature-detected by checking whether the option exists —
 * unknown dictionary members are silently ignored per WebIDL, so an older
 * engine returns an un-rotated bitmap with no error and every phone photo
 * posts sideways. The only reliable test is to decode a known fixture and
 * measure the result. Memoized: it runs at most once per page.
 */
async function honoursExifOrientation(): Promise<boolean> {
  if (orientationSupport) return orientationSupport;

  orientationSupport = (async () => {
    try {
      const blob = await (await fetch(ORIENTATION_FIXTURE)).blob();
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      try {
        // The fixture is 3 wide by 2 tall before rotation.
        return bitmap.width === 2 && bitmap.height === 3;
      } finally {
        bitmap.close();
      }
    } catch {
      return false;
    }
  })();

  return orientationSupport;
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decode(file: File): Promise<Decoded | null> {
  if (
    typeof createImageBitmap === "function" &&
    (await honoursExifOrientation())
  ) {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }

  // Fallback: <img> rendering applies EXIF orientation natively, because CSS
  // `image-orientation: from-image` is the initial value. So where the bitmap
  // path would be wrong, this one is right.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function createCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality }).catch(() => null);
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Draws `source` down to the target size. Reductions greater than 2x are done
 * in successive halving passes — a one-shot large downscale aliases badly on
 * text, which is the dominant content in a proof screenshot, and the extra
 * passes cost microseconds.
 */
function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: { width: number; height: number },
) {
  let current = createCanvas(sourceWidth, sourceHeight);
  let context = current.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) return null;

  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight);

  let width = sourceWidth;
  let height = sourceHeight;

  while (width > target.width * 2 && height > target.height * 2) {
    const nextWidth = Math.max(target.width, Math.round(width / 2));
    const nextHeight = Math.max(target.height, Math.round(height / 2));
    const next = createCanvas(nextWidth, nextHeight);
    const nextContext = next.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!nextContext) return null;

    nextContext.imageSmoothingQuality = "high";
    nextContext.drawImage(
      current as unknown as CanvasImageSource,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    current = next;
    context = nextContext;
    width = nextWidth;
    height = nextHeight;
  }

  if (width === target.width && height === target.height) return current;

  const final = createCanvas(target.width, target.height);
  const finalContext = final.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!finalContext) return null;

  finalContext.imageSmoothingQuality = "high";
  finalContext.drawImage(
    current as unknown as CanvasImageSource,
    0,
    0,
    target.width,
    target.height,
  );
  return final;
}

function passthrough(
  file: File,
  mimeType: AttachmentMimeType,
  reason: NormalizeReason,
  width: number | null = null,
  height: number | null = null,
): NormalizedImage {
  return { file, mimeType, width, height, changed: false, reason };
}

/**
 * Normalizes one file for upload. `mimeType` must already have been derived
 * from the file's real bytes (see `sniffBlob`), not from `file.type`.
 *
 * Never throws — every failure path returns the original file, because
 * refusing to upload a screenshot because we could not shrink it would be a
 * worse outcome than uploading it as-is.
 */
export async function normalizeImageInBrowser(
  file: File,
  mimeType: AttachmentMimeType,
  options: NormalizeImageOptions = {},
): Promise<NormalizedImage> {
  if (categoryForMimeType(mimeType) !== "image") {
    return passthrough(file, mimeType, "passthrough-not-image");
  }

  const { maxDimension, quality } = { ...DEFAULTS, ...options };

  let decoded: Decoded | null = null;
  try {
    decoded = await decode(file);
    if (!decoded) {
      return passthrough(file, mimeType, "passthrough-unsupported-api");
    }

    const { width, height } = decoded;
    if (!shouldRecompress(mimeType, file.size, width, height, options)) {
      return passthrough(file, mimeType, "passthrough-small", width, height);
    }

    const target = targetDimensions(width, height, maxDimension);
    const canvas = drawScaled(decoded.source, width, height, target);
    if (!canvas) {
      return passthrough(
        file,
        mimeType,
        "passthrough-unsupported-api",
        width,
        height,
      );
    }

    let blob = await toBlob(canvas, "image/webp", quality);
    // A browser without WebP encode support silently hands back a PNG rather
    // than failing, so trust `blob.type` over what we asked for.
    if (blob && blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg", 0.85);
      if (blob && blob.type !== "image/jpeg") blob = null;
    }
    if (!blob) {
      return passthrough(
        file,
        mimeType,
        "passthrough-unsupported-api",
        width,
        height,
      );
    }

    // Re-encoding a small PNG of a UI panel can produce a larger, blurrier
    // file. When it does, keep the original.
    if (blob.size >= file.size) {
      return passthrough(
        file,
        mimeType,
        "passthrough-larger-output",
        width,
        height,
      );
    }

    const outputType = blob.type as AttachmentMimeType;
    return {
      file: new File([blob], retypeFilename(file.name, outputType), {
        type: outputType,
        lastModified: file.lastModified,
      }),
      mimeType: outputType,
      width: target.width,
      height: target.height,
      changed: true,
      reason: "recompressed",
    };
  } catch {
    return passthrough(file, mimeType, "passthrough-unsupported-api");
  } finally {
    decoded?.release();
  }
}
