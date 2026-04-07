import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getDocumentTemplate } from "@/lib/documents";

export const metadata: Metadata = {
  title: "Payment Flow — MYSverse DevHub",
  description:
    "How payments work on MYSverse DevHub — from task completion to payout.",
};

export default function PaymentFlowPage() {
  const { content, meta } = getDocumentTemplate("PAYMENT_FLOW");
  return <PolicyPage title={meta.title} content={content} />;
}
