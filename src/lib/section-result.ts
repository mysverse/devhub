import { transientErrorCode } from "@/lib/prisma-retry";

/**
 * One independently-loadable slice of a page.
 *
 * A page that fans out ten queries in a single `Promise.all` fails as a unit:
 * one rejected promise and the whole route falls through to the error
 * boundary. On the admin payout board that meant a transient Accelerate 503
 * (P6000, Cloudflare error 1102) blanked every tab, including the ones whose
 * queries had come back fine, and blocked all payout work until it cleared.
 *
 * Wrapping each slice lets the rest of the page render. The failure is never
 * swallowed: it is logged server-side and the caller is expected to say so in
 * the UI — an empty tab on a money surface reads as "nothing to pay", which is
 * a worse outcome than an error page.
 */
export type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; detail: string };

export async function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<SectionResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    console.error(`[section] ${label} failed to load:`, error);
    return { ok: false, detail: transientErrorCode(error) };
  }
}

/** The loaded data, or `fallback` when the section failed. */
export function sectionData<T>(result: SectionResult<T>, fallback: T): T {
  return result.ok ? result.data : fallback;
}

/** Short cause for the UI (`P6000`, `503`, an error class name), or null. */
export function sectionDetail(result: SectionResult<unknown>): string | null {
  return result.ok ? null : result.detail;
}
