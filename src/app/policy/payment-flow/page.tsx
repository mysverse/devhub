import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata("/policy/payment-flow");

export default function PaymentFlowPage() {
  const { content, meta } = getDocumentTemplate("PAYMENT_FLOW");
  return <PolicyPage title={meta.title} content={content} />;
}
