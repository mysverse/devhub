import { Button, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function WelcomePackOrderDelivered({
  userName,
}: {
  userName: string;
}) {
  return (
    <BaseLayout previewText="Your welcome pack was delivered">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Welcome Pack Delivered
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your welcome pack was marked as delivered. We hope you enjoy it! If
        anything arrived damaged or is missing, reply to this email and
        we&apos;ll sort it out.
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
