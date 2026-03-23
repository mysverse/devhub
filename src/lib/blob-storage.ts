import { del, put } from "@vercel/blob";

/**
 * Upload a transaction PDF to Vercel Blob storage.
 * Uses a deterministic path so re-uploads overwrite the same blob.
 */
export async function uploadTransactionPdf(
  transactionId: string,
  buffer: Buffer,
): Promise<string> {
  const { url } = await put(
    `payment-slips/${transactionId}.pdf`,
    new Uint8Array(buffer),
    {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/pdf",
    },
  );
  return url;
}

/**
 * Delete a transaction PDF from Vercel Blob storage.
 */
export async function deleteTransactionPdf(blobUrl: string): Promise<void> {
  await del(blobUrl);
}
