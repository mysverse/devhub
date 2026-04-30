export const WELCOME_PACK_ASSET_KINDS = [
  "item-image",
  "size-chart",
  "id-card-template",
] as const;

export type WelcomePackAssetKind = (typeof WELCOME_PACK_ASSET_KINDS)[number];

/**
 * Stable proxy URL for a welcome pack asset. The proxy looks up the actual
 * (private) blob URL by id. Optional cache-buster `v` lets re-uploads
 * invalidate the browser cache without changing the path.
 */
export function welcomePackAssetUrl(
  kind: WelcomePackAssetKind,
  id: string,
  v?: string | number | Date | null,
): string {
  const base = `/api/welcome-pack/asset/${kind}/${id}`;
  if (v == null) return base;
  const stamp = v instanceof Date ? v.getTime() : v;
  return `${base}?v=${encodeURIComponent(String(stamp))}`;
}
