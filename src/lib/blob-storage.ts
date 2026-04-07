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
