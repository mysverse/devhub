import { unstable_rethrow } from "next/navigation";
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
    // Next signals control flow by throwing: redirect(), notFound(),
    // forbidden(), and — with cacheComponents on — the dynamic-access bailouts
    // and PPR postpone. Catching those turns a redirect into a rendered page
    // and silently breaks prerendering. Harmless while the only caller ran
    // requireAdminPage() first; a live bug the moment a section wraps
    // something that redirects, which the dashboard layout does.
    //
    // Next exports the exact predicate, so use it rather than duck-typing
    // digest strings — those are framework internals that change between
    // releases, and a hand-written list would silently stop matching.
    unstable_rethrow(error);
    console.error(`[section] ${label} failed to load:`, error);
    return { ok: false, detail: transientErrorCode(error) };
  }
}

/**
 * A section whose only sane response to failure is to render its fallback —
 * a decorative banner, an optional badge. Three lines over `loadSection`, and
 * no new concept: use it where nothing downstream needs the failure as a
 * value, and `loadSection` where the UI must say that something is missing.
 */
export async function loadOptionalSection<T>(
  label: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  return sectionData(await loadSection(label, load), fallback);
}

/** The loaded data, or `fallback` when the section failed. */
export function sectionData<T>(result: SectionResult<T>, fallback: T): T {
  return result.ok ? result.data : fallback;
}

/** Short cause for the UI (`P6000`, `503`, an error class name), or null. */
export function sectionDetail(result: SectionResult<unknown>): string | null {
  return result.ok ? null : result.detail;
}
