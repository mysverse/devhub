import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PaymentRejected({
  userName,
  amount,
  taskTitle,
  reason,
}: {
  userName: string;
  amount: string;
  taskTitle: string;
  reason?: string;
}) {
  return (
    <BaseLayout previewText="Your payout has been rejected">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Payout Rejected
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your payout has been rejected by an administrator. Please review the
        details below and reach out if you have any questions.
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
          Rejection Details
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
          {taskTitle}
        </Text>
      </Section>
      {reason && (
        <Section
          style={{
            backgroundColor: "#2c2e33",
            borderLeft: "3px solid #e8590c",
            borderRadius: "4px",
            padding: "12px 16px",
            margin: "16px 0",
          }}
        >
          <Text
            style={{
              color: "#e8590c",
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
