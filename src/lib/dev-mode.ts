/**
 * Single source of truth for dev mode detection.
 * Set NEXT_PUBLIC_DEV_MODE=true in .env.local to enable.
 *
 * Dev mode bypasses all DB, auth, and external service dependencies,
 * serving mock data instead so you can iterate on UI with `pnpm dev`.
 */
export function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}
