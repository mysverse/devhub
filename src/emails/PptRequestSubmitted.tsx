import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PptRequestSubmitted({
  requesterName,
  issueTitle,
  isNewIssue,
  issueIdentifier,
  estimate,
  estimatedAmount,
  dueDate,
  note,
}: {
  requesterName: string;
  issueTitle: string;
  isNewIssue: boolean;
  issueIdentifier?: string;
  estimate: number;
  estimatedAmount: string;
  dueDate: string;
  note?: string;
}) {
  return (
    <BaseLayout previewText={`New PPT request from ${requesterName}`}>
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        New PPT Request
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        {requesterName} has submitted a PPT request for your review.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #228be6",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: "#228be6",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          {isNewIssue ? "New Issue Request" : "Existing Issue"}
        </Text>
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
            margin: "0 0 4px 0",
          }}
        >
          Complexity: {estimate} &middot; {estimatedAmount}
        </Text>
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          Due: {dueDate}
        </Text>
      </Section>
      {note && (
        <Section
          style={{
            backgroundColor: "#2c2e33",
            borderLeft: "3px solid #868e96",
            borderRadius: "4px",
            padding: "12px 16px",
            margin: "16px 0",
          }}
        >
          <Text
            style={{
              color: "#868e96",
              fontSize: "12px",
              fontWeight: 600,
              margin: "0 0 4px 0",
              textTransform: "uppercase" as const,
              letterSpacing: "0.5px",
            }}
          >
            Note
          </Text>
          <Text
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "22px",
              margin: 0,
            }}
          >
            {note}
          </Text>
        </Section>
      )}
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
        Review Request
      </Button>
    </BaseLayout>
  );
}
