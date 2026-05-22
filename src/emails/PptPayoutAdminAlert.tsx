import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PptPayoutAdminAlert({
  issueIdentifier,
  issueTitle,
  developerName,
  reason,
  detail,
}: {
  issueIdentifier?: string | null;
  issueTitle: string;
  developerName?: string | null;
  reason: string;
  detail?: string | null;
}) {
  return (
    <BaseLayout previewText="PPT payout requires admin attention">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        PPT Payout Alert
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        A PPT payout needs admin attention in DevHub.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #e03131",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        {issueIdentifier && (
          <Text
            style={{
              color: "#909296",
              fontSize: "12px",
              lineHeight: "20px",
              margin: "0 0 4px 0",
            }}
          >
            {issueIdentifier}
          </Text>
        )}
        <Text
          style={{
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 600,
            lineHeight: "24px",
            margin: "0 0 8px 0",
          }}
        >
          {issueTitle}
        </Text>
        {developerName && (
          <Text
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "22px",
              margin: "0 0 4px 0",
            }}
          >
            Developer: {developerName}
          </Text>
        )}
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: "0 0 4px 0",
          }}
        >
          Reason: {reason}
        </Text>
        {detail && (
          <Text
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "22px",
              margin: 0,
            }}
          >
            {detail}
          </Text>
        )}
      </Section>
      <Button
        href={`${appUrl}/dashboard/admin`}
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
        Review in DevHub
      </Button>
    </BaseLayout>
  );
}
