import { Button, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function KycApproved({ userName }: { userName: string }) {
  return (
    <BaseLayout previewText="Your identity has been verified">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Identity Verified
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your identity verification has been approved. You can now enable
        automatic payouts for eWallet payment methods (TnG, GrabPay, etc.) in
        your settings.
      </Text>
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
        View Settings
      </Button>
    </BaseLayout>
  );
}
