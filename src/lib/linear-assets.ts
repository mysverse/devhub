/**
 * Rules for displaying assets referenced from Linear issue and comment bodies.
 *
 * Pure and dependency-free so both the renderer (`LinearMarkdown`) and its
 * tests can use them without dragging React in.
 */

/**
 * Hosts `/api/image-proxy` will fetch on our behalf. Kept in sync with
 * ALLOWED_HOSTS in src/app/api/image-proxy/route.ts, which is the authority
 * and rejects anything else with a 403.
 */
export const PROXIED_IMAGE_HOSTS = ["uploads.linear.app", "linear.app"];

function hostnameOf(src: string): string | null {
  try {
    // The base makes relative URLs parse; a relative src has no host to check.
    const url = new URL(src, "https://relative.invalid");
    return url.hostname === "relative.invalid" ? null : url.hostname;
  } catch {
    return null;
  }
}

/**
 * Routes a Linear-hosted asset through the authenticated proxy and leaves
 * every other URL alone.
 *
 * Linear assets require a bearer token, so a bare `<img src>` pointed at one
 * renders broken.
 */
export function proxiedImageUrl(src: string): string {
  const hostname = hostnameOf(src);
  if (!hostname || !PROXIED_IMAGE_HOSTS.includes(hostname)) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

/**
 * Whether an image URL is one DevHub can vouch for.
 *
 * This is the reason the attachment feature exists: developers pasted Discord
 * CDN links into proof comments, and those links expire — leaving a payout
 * unverifiable weeks later when an admin finally reviews it. Anything hosted
 * somewhere we do not control gets labelled at the moment someone looks at it.
 */
export function isDurableImageUrl(src: string): boolean {
  const hostname = hostnameOf(src);
  if (!hostname) return true; // relative — served by us
  return (
    PROXIED_IMAGE_HOSTS.includes(hostname) ||
    hostname.endsWith(".public.blob.vercel-storage.com")
  );
}

/** First image URL in a markdown body, already proxied. Null when there is none. */
export function firstProxiedImage(
  markdown: string | null | undefined,
): string | null {
  if (!markdown) return null;
  const match = markdown.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
  return match ? proxiedImageUrl(match[1]) : null;
}
