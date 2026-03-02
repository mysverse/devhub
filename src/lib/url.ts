/**
 * Returns the application's base URL based on environment,
 * in order of priority:
 * 1. VERCEL_PROJECT_PRODUCTION_URL (with https://)
 * 2. NEXT_PUBLIC_APP_URL (if set)
 * 3. http://localhost:3000 (fallback)
 */
export function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return "http://localhost:3000";
}
