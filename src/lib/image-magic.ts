/**
 * Magic-byte MIME detection for uploaded images.
 *
 * Lived in `src/lib/kyc.ts` until identity-document collection was retired.
 * It is not KYC-specific and never was — `api/welcome-pack/upload` is the
 * remaining caller, and it is that route's only defence against a
 * browser-supplied `File.type`, which is attacker-controlled.
 *
 * Kept separate from `attachment-magic.ts`, which is deliberately free of
 * `Buffer` and every node builtin so the same code can run in the browser.
 * This one is server-side by construction.
 */

/**
 * Detect MIME type from file magic bytes.
 * Returns null if the file type is not recognized.
 */
export function detectImageMimeType(buffer: Buffer): string | null {
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
  return null;
}
