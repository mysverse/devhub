import type { ShippingRegion } from "@prisma/client";
import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function WelcomePackOrderSubmitted({
  developerName,
  recipientName,
  region,
  wave,
  idCardName,
}: {
  developerName: string;
  recipientName: string;
  region: ShippingRegion;
  wave: number;
  idCardName: string;
}) {
  return (
    <BaseLayout previewText={`New welcome pack order from ${developerName}`}>
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        New Welcome Pack Order
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        {developerName} has submitted a welcome pack order.
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #228be6",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: "#228be6",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          Wave {wave} ·{" "}
          {region === "DOMESTIC" ? "Domestic (MY)" : "International"}
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
          Recipient: {recipientName}
        </Text>
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          ID card name: {idCardName}
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
        Review Order
      </Button>
    </BaseLayout>
  );
}
