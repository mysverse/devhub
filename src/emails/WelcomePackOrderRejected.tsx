import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function WelcomePackOrderRejected({
  userName,
  reason,
}: {
  userName: string;
  reason?: string;
}) {
  return (
    <BaseLayout previewText="Update on your welcome pack order">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Welcome Pack Order Update
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Unfortunately, we couldn&apos;t fulfill your welcome pack order at this
        time.
      </Text>
      {reason && (
        <Section
          style={{
            backgroundColor: "#2c2e33",
            borderLeft: "3px solid #c92a2a",
            borderRadius: "4px",
            padding: "12px 16px",
            margin: "16px 0",
          }}
        >
          <Text
            style={{
              color: "#fa5252",
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
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Reach out to the DevHub team if you have any questions.
      </Text>
      <Button
        href={`${appUrl}/dashboard/welcome-pack`}
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
        View Order
      </Button>
    </BaseLayout>
  );
}
