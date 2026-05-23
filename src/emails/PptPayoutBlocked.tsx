import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PptPayoutBlocked({
  userName,
  issueIdentifier,
  issueTitle,
  issueUrl,
  reason,
  action,
}: {
  userName: string;
  issueIdentifier?: string | null;
  issueTitle: string;
  issueUrl?: string | null;
  reason: string;
  action: string;
}) {
  return (
    <BaseLayout previewText="Your PPT payout needs attention">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        PPT Payout Needs Attention
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        DevHub checked your completed PPT task, but it is not ready for payout
        yet.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #f08c00",
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
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: "0 0 8px 0",
          }}
        >
          Reason: {reason}
        </Text>
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          Next step: {action}
        </Text>
      </Section>
      <Button
        href={issueUrl || `${appUrl}/dashboard`}
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
        Open Task
      </Button>
    </BaseLayout>
  );
}
