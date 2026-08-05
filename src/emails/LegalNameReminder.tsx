import { Button, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function LegalNameReminder({ userName }: { userName: string }) {
  return (
    <BaseLayout previewText="Please update your legal name on DevHub">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Legal Name Required
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Our records indicate that your profile does not have a valid legal name.
        A real legal name is required for payment processing and compliance
        purposes. Please update your profile with the full name as it appears on
        your official identification documents.
      </Text>
      <Text
        style={{
          color: "#909296",
          fontSize: "13px",
          lineHeight: "20px",
          fontStyle: "italic",
        }}
      >
        Your legal name is only used for payouts, KYC, signed documents and
        parcel labels, and is visible only to authorised administrators. It is
        never shown to other developers — they see your display name.
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
        Update Your Profile
      </Button>
    </BaseLayout>
  );
}
