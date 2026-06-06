import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function IncentiveEarned({
  userName,
  amount,
  awardType,
  period,
  held,
  releaseAt,
}: {
  userName: string;
  amount: string;
  awardType: string;
  period: string;
  held: boolean;
  releaseAt: string | null;
}) {
  return (
    <BaseLayout previewText="You earned a DevHub incentive">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Incentive Earned
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        You earned a DevHub activity incentive. Admins can still review it
        during the hold window before payout release.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: `3px solid ${held ? "#f08c00" : "#2b8a3e"}`,
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: held ? "#f08c00" : "#2b8a3e",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          {held ? "Held for review" : "Pending release"}
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
          {amount}
        </Text>
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          {awardType} - {period}
          {releaseAt
            ? ` - releases after ${new Date(releaseAt).toLocaleString()}`
            : ""}
        </Text>
      </Section>
      <Button
        href={`${appUrl}/dashboard`}
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
        View Dashboard
      </Button>
    </BaseLayout>
  );
}
