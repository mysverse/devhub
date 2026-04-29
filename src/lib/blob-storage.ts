import { del, put } from "@vercel/blob";

/**
 * Upload a transaction PDF to Vercel Blob storage.
 * Uses a deterministic path so re-uploads overwrite the same blob.
 */
export async function uploadTransactionPdf(
  transactionId: string,
  buffer: Buffer,
): Promise<string> {
  const { url } = await put(`payment-slips/${transactionId}.pdf`, buffer, {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/pdf",
  });
  return url;
}

/**
 * Delete a transaction PDF from Vercel Blob storage.
 */
export async function deleteTransactionPdf(blobUrl: string): Promise<void> {
  await del(blobUrl);
}

/**
 * Upload a KYC document (ID photo or selfie) to Vercel Blob storage.
 * Uses a deterministic path under kyc-documents/.
 */
export async function uploadKycDocument(
  verificationId: string,
  type: "id-document" | "selfie",
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const { url } = await put(
    `kyc-documents/${verificationId}/${type}.${ext}`,
    buffer,
    {
      access: "private",
      addRandomSuffix: false,
      contentType,
    },
  );
  return url;
}

/**
 * Delete KYC documents from Vercel Blob storage.
 */
export async function deleteKycDocuments(blobUrls: string[]): Promise<void> {
  await Promise.all(blobUrls.filter(Boolean).map((url) => del(url)));
}

function extForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Upload a welcome pack item image (product photo). Stored under a public
 * access path so the user-facing pages can render via direct blob URL.
 * Random suffix lets re-uploads coexist while we delete the previous URL.
 */
export async function uploadWelcomePackItemImage(
  itemId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = extForContentType(contentType);
  const { url } = await put(
    `welcome-pack/items/${itemId}/image.${ext}`,
    buffer,
    {
      access: "public",
      addRandomSuffix: true,
      contentType,
    },
  );
  return url;
}

/**
 * Upload a welcome pack item size chart image.
 */
export async function uploadWelcomePackSizeChart(
  itemId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = extForContentType(contentType);
  const { url } = await put(
    `welcome-pack/items/${itemId}/size-chart.${ext}`,
    buffer,
    {
      access: "public",
      addRandomSuffix: true,
      contentType,
    },
  );
  return url;
}

/**
 * Upload the welcome pack ID card template (background used for the name overlay).
 */
export async function uploadWelcomePackIdCardTemplate(
  packId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = extForContentType(contentType);
  const { url } = await put(
    `welcome-pack/${packId}/id-card-template.${ext}`,
    buffer,
    {
      access: "public",
      addRandomSuffix: true,
      contentType,
    },
  );
  return url;
}

/**
 * Delete a welcome pack blob (item image, size chart, or ID card template).
 * Safe to call with an empty / undefined URL.
 */
export async function deleteWelcomePackBlob(
  blobUrl: string | null | undefined,
): Promise<void> {
  if (!blobUrl) return;
  try {
    await del(blobUrl);
  } catch (error) {
    console.error("[welcome-pack] Failed to delete blob:", error);
  }
}
