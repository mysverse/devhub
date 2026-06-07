import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata("/policy/aml-kyc");

export default function AmlKycPolicyPage() {
  const { content, meta } = getDocumentTemplate("AML_KYC");
  return <PolicyPage title={meta.title} content={content} />;
}
