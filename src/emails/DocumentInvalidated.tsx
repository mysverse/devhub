import { Button, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function DocumentInvalidated({
  userName,
  documentType,
}: {
  userName: string;
  documentType: string;
}) {
  return (
    <BaseLayout previewText={`Your ${documentType} document needs re-signing`}>
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Document Re-signing Required
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your previously signed <strong>{documentType}</strong> document has been
        invalidated by an administrator. This may be due to updated terms,
        incorrect information, or a required review.
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Please sign the updated document at your earliest convenience to remain
        in compliance.
      </Text>
      <Button
        href={`${appUrl}/dashboard/documents`}
        style={{
          backgroundColor: "#228be6",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          padding: "10px 24px",
          textDecoration: "none",
        }}
      >
        Sign Documents
      </Button>
    </BaseLayout>
  );
}
