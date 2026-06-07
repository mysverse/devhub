import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata("/policy/asset-rights");

export default function AssetRightsPage() {
  const { content, meta } = getDocumentTemplate("ASSET_RIGHTS");
  return <PolicyPage title={meta.title} content={content} />;
}
