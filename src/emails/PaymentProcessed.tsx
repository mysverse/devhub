import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PaymentProcessed({
  userName,
  amount,
  taskTitle,
}: {
  userName: string;
  amount: string;
  taskTitle: string;
}) {
  return (
    <BaseLayout previewText="Your payment has been processed">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Payment Processed
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your payment has been processed. Please find the payment slip attached
        to this email.
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
          Payment Details
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
