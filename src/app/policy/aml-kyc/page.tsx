import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";

export const metadata: Metadata = {
  title: "AML/KYC Policy — MYSverse DevHub",
  description:
    "Anti-Money Laundering and Know Your Customer policy for MYSverse DevHub automated payouts.",
};

export default function AmlKycPolicyPage() {
  const { content, meta } = getDocumentTemplate("AML_KYC");
  return <PolicyPage title={meta.title} content={content} />;
}
