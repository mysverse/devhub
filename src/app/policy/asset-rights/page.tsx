import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";

export const metadata: Metadata = {
  title: "Asset Rights & Ownership Policy — MYSverse DevHub",
  description:
    "Asset ownership, licensing, and donation policy regulations for MYSverse.",
};

export default function AssetRightsPage() {
  const { content, meta } = getDocumentTemplate("ASSET_RIGHTS");
  return <PolicyPage title={meta.title} content={content} />;
}
