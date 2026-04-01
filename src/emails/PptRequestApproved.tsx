import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

export default function PptRequestApproved({
  userName,
  issueIdentifier,
  issueTitle,
  issueUrl,
  estimate,
  estimatedAmount,
}: {
  userName: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  estimate: number;
  estimatedAmount: string;
}) {
  return (
    <BaseLayout previewText="Your PPT request has been approved">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        PPT Request Approved
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your PPT request has been approved. The task is now available on the PPT
        board.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #2b8a3e",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: "#2b8a3e",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          Approved Task
        </Text>
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
        <Text
          style={{
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 600,
            lineHeight: "24px",
            margin: "0 0 4px 0",
          }}
        >
          {issueTitle}
        </Text>
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          Complexity: {estimate} &middot; {estimatedAmount}
        </Text>
      </Section>
      <Button
        href={issueUrl}
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
        View in Linear
      </Button>
    </BaseLayout>
  );
}
