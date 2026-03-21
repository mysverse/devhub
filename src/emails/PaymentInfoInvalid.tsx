import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PaymentInfoInvalid({
  userName,
  reason,
}: {
  userName: string;
  reason?: string;
}) {
  return (
    <BaseLayout previewText="There is an issue with your payment information">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Payment Information Issue
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        We were unable to process your payout because there is an issue with
        your payment information. Please review and update your payment details.
      </Text>
      {reason && (
        <Section
          style={{
            backgroundColor: "#2c2e33",
            borderLeft: "3px solid #fab005",
            borderRadius: "4px",
            padding: "12px 16px",
            margin: "16px 0",
          }}
        >
          <Text
            style={{
              color: "#fab005",
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
        Update Payment Info
      </Button>
    </BaseLayout>
  );
}
