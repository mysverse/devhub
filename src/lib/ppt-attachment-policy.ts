/**
 * The single definition of what may be attached to a PPT request or a PPT
 * progress/proof comment, and how big it may be.
 *
 * Client-safe on purpose — no Prisma, no `sharp`, no node builtins — because
 * the composer, the file picker, the upload routes and the server-side
 * validator must all agree. They previously did not: `PptRequestModal` carried
 * its own copies of the limits and advertised "10 MB each, 30 MB total" while
 * Vercel rejected anything over ~4.5 MB before the route ever ran.
 */

const MB = 1024 * 1024;

export const ATTACHMENT_CATEGORIES = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * MB,
    label: "image",
  },
  pdf: {
    mimeTypes: ["application/pdf"],
    maxBytes: 20 * MB,
    label: "PDF",
  },
  video: {
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    // Provisional. Linear's help pages state 10 MB/file on free plans and
    // 25 MB for email-created issues, but document nothing for the fileUpload
    // GraphQL path. `pnpm tsx scripts/dev/probe-linear-upload.ts` measures the
    // real ceiling — treat this number as unresearched until that has run.
    maxBytes: 25 * MB,
    label: "video",
  },
} as const;

export type AttachmentCategory = keyof typeof ATTACHMENT_CATEGORIES;

export type AttachmentMimeType =
  (typeof ATTACHMENT_CATEGORIES)[AttachmentCategory]["mimeTypes"][number];

/** Per comment or request, not per session. */
export const ATTACHMENT_MAX_FILES = 8;

/**
 * Vercel rejects serverless request bodies over 4.5 MB before the function
 * runs, so anything larger cannot reach a route handler at all. Files above
 * this go through the Vercel Blob relay instead; see
 * `src/app/api/ppt-attachments/relay/route.ts`.
 */
export const PROXY_MAX_BYTES = 4 * MB;

/** Where a file's bytes travel on their way to Linear. */
export type AttachmentTransport = "proxy" | "relay" | "dev";

const ALL_MIME_TYPES: readonly string[] = Object.values(
  ATTACHMENT_CATEGORIES,
).flatMap((category) => [...category.mimeTypes]);

export function isAttachmentMimeType(
  mimeType: string,
): mimeType is AttachmentMimeType {
  return ALL_MIME_TYPES.includes(mimeType);
}

export function categoryForMimeType(
  mimeType: string,
): AttachmentCategory | null {
  for (const [name, category] of Object.entries(ATTACHMENT_CATEGORIES)) {
    if ((category.mimeTypes as readonly string[]).includes(mimeType)) {
      return name as AttachmentCategory;
    }
  }
  return null;
}

export function maxBytesFor(mimeType: string): number {
  const category = categoryForMimeType(mimeType);
  return category ? ATTACHMENT_CATEGORIES[category].maxBytes : 0;
}

export function isAttachmentImage(mimeType: string) {
  return categoryForMimeType(mimeType) === "image";
}

export function isAttachmentVideo(mimeType: string) {
  return categoryForMimeType(mimeType) === "video";
}

/**
 * Which transport a file of this size must use. Callers never choose — the
 * size decides, so a caller cannot route a 20 MB video through a path that
 * would 413 before reaching us.
 */
export function transportForSize(byteSize: number): AttachmentTransport {
  return byteSize > PROXY_MAX_BYTES ? "relay" : "proxy";
}

/** Human-readable size, matching the format used across the dashboard. */
export function formatFileSize(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Where attachments are being added from. The two surfaces differ in more than
 * taste:
 *
 * - `ppt-request` posts every file in a single multipart request to
 *   `/api/ppt-requests`, so the whole selection has to fit inside Vercel's body
 *   cap. It also predates video and has no reason to take it — a request is a
 *   proposal, not evidence.
 * - `ppt-comment` uploads each file on its own, routing anything over the cap
 *   through the Vercel Blob relay, so its ceiling is a product decision rather
 *   than a platform one.
 */
export type AttachmentSurface = "ppt-request" | "ppt-comment";

const SURFACES: Record<
  AttachmentSurface,
  { categories: AttachmentCategory[]; maxTotalBytes: number }
> = {
  // Not a preference — a single multipart POST larger than this is rejected by
  // the platform before the route handler runs. The form advertised "30 MB
  // total" for a long time and 413'd well short of it.
  "ppt-request": {
    categories: ["image", "pdf"],
    maxTotalBytes: PROXY_MAX_BYTES,
  },
  "ppt-comment": {
    categories: ["image", "pdf", "video"],
    maxTotalBytes: 60 * MB,
  },
};

export function categoriesForSurface(surface: AttachmentSurface) {
  return SURFACES[surface].categories;
}

export function maxTotalBytesForSurface(surface: AttachmentSurface) {
  return SURFACES[surface].maxTotalBytes;
}

export function mimeTypesForSurface(
  surface: AttachmentSurface,
): AttachmentMimeType[] {
  return categoriesForSurface(surface).flatMap((category) => [
    ...ATTACHMENT_CATEGORIES[category].mimeTypes,
  ]);
}

/** Value for a file input's `accept` attribute. */
export function acceptForSurface(surface: AttachmentSurface) {
  return mimeTypesForSurface(surface).join(",");
}

/**
 * The one-line description shown under a file picker. Derived from the same
 * constants the validator enforces, so the two cannot drift — the previous
 * hardcoded copy promised limits the platform never honoured.
 */
export function describeAttachmentLimits(surface: AttachmentSurface) {
  const total = maxTotalBytesForSurface(surface);
  const perFile = Math.min(
    total,
    ...categoriesForSurface(surface).map(
      (category) => ATTACHMENT_CATEGORIES[category].maxBytes,
    ),
  );
  const kinds = categoriesForSurface(surface)
    .map((category) => `${ATTACHMENT_CATEGORIES[category].label}s`)
    .join(", ");

  return perFile >= total
    ? `${kinds} — up to ${ATTACHMENT_MAX_FILES} files, ${Math.round(total / MB)} MB total.`
    : `${kinds} — up to ${ATTACHMENT_MAX_FILES} files, ${Math.round(perFile / MB)} MB each, ${Math.round(total / MB)} MB total.`;
}

export type AttachmentSelectionInput = {
  name: string;
  size: number;
  type: string;
};

/**
 * Pre-flight validation of a whole selection. Returns the first problem in a
 * message written for the person who picked the files, or null when the
 * selection is acceptable. The server re-validates regardless — this exists so
 * the rejection arrives before the upload, not after it.
 */
export function checkAttachmentSelection(
  files: AttachmentSelectionInput[],
  surface: AttachmentSurface,
): { error: string } | null {
  if (files.length > ATTACHMENT_MAX_FILES) {
    return { error: `You can attach up to ${ATTACHMENT_MAX_FILES} files.` };
  }

  const allowed = categoriesForSurface(surface);

  for (const file of files) {
    const category = categoryForMimeType(file.type);
    if (!category || !allowed.includes(category)) {
      return {
        error: `${file.name} isn't a supported file type. ${describeAttachmentLimits(surface)}`,
      };
    }
    const maxTotal = maxTotalBytesForSurface(surface);
    const limit = Math.min(ATTACHMENT_CATEGORIES[category].maxBytes, maxTotal);
    if (file.size > limit) {
      return {
        error: `${file.name} is ${formatFileSize(file.size)} — the limit is ${Math.round(limit / MB)} MB.`,
      };
    }
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotal = maxTotalBytesForSurface(surface);
  if (total > maxTotal) {
    return {
      error: `Attachments total ${formatFileSize(total)} — the limit is ${Math.round(maxTotal / MB)} MB.`,
    };
  }

  return null;
}
