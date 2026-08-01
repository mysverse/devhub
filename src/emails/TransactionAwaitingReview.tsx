import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function TransactionAwaitingReview({
  userName,
  issueIdentifier,
  issueTitle,
  amountLabel,
  limitLabel,
}: {
  userName: string;
  issueIdentifier?: string | null;
  issueTitle: string;
  amountLabel: string;
  limitLabel: string;
}) {
  return (
    <BaseLayout previewText="Your payout was created and is awaiting admin review">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Payout Created &mdash; Awaiting Admin Review
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Good news first: your PPT passed every payout check and a payment of{" "}
        {amountLabel} was created. Because it takes you past this week&apos;s{" "}
        {limitLabel} auto-approval limit, an admin will release it manually
        instead of it going out automatically.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #fab005",
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
            margin: 0,
          }}
        >
          Your payment is not lost &mdash; it stays queued until an admin
          releases it. Weekly limits reset every Monday (UTC).
        </Text>
      </Section>
      <Button
        href={`${appUrl}/dashboard/transactions`}
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
        View Transaction
      </Button>
    </BaseLayout>
  );
}
