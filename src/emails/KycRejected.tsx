import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function KycRejected({
  userName,
  reason,
}: {
  userName: string;
  reason?: string;
}) {
  return (
    <BaseLayout previewText="Your identity verification was not approved">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Verification Not Approved
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Unfortunately, your identity verification was not approved.
      </Text>
      {reason && (
        <Section
          style={{
            backgroundColor: "#2c2e33",
            borderLeft: "3px solid #e03131",
            borderRadius: "4px",
            padding: "12px 16px",
            margin: "16px 0",
          }}
        >
          <Text
            style={{
              color: "#e03131",
              fontSize: "12px",
              fontWeight: 600,
              margin: "0 0 4px 0",
              textTransform: "uppercase" as const,
              letterSpacing: "0.5px",
            }}
          >
            Reason
          </Text>
          <Text
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "22px",
              margin: 0,
            }}
          >
            {reason}
          </Text>
        </Section>
      )}
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        You can resubmit your documents from the settings page. Please ensure
        your ID photo is clear and fully visible, and that your selfie clearly
        shows you holding the document.
      </Text>
      <Button
        href={`${appUrl}/dashboard/settings`}
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
        Resubmit Documents
      </Button>
    </BaseLayout>
  );
}
