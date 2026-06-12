import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Sent to admins when a developer cancels their own pending order. */
export default function WelcomePackOrderCancelled({
  developerName,
  recipientName,
}: {
  developerName: string;
  recipientName: string;
}) {
  return (
    <BaseLayout
      previewText={`Welcome pack order cancelled by ${developerName}`}
    >
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Welcome Pack Order Cancelled
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        {developerName} cancelled their pending welcome pack order.
      </Text>
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
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          Recipient: {recipientName}
        </Text>
      </Section>
      <Button
        href={`${appUrl}/dashboard/admin/welcome-pack`}
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
        View Orders
      </Button>
    </BaseLayout>
  );
}
