import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function WelcomePackOrderShipped({
  userName,
  carrierName,
  trackingNumber,
  trackingUrl,
  estimatedDeliveryAt,
}: {
  userName: string;
  carrierName?: string | null;
  trackingNumber: string;
  trackingUrl: string | null;
  estimatedDeliveryAt?: string | null;
}) {
  return (
    <BaseLayout previewText="Your welcome pack is on the way">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Welcome Pack Shipped
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Your welcome pack is on the way. Use the tracking details below to
        follow its progress.
      </Text>
      {(carrierName || estimatedDeliveryAt) && (
        <Text
          style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}
        >
          {carrierName ? `Carrier: ${carrierName}. ` : ""}
          {estimatedDeliveryAt
            ? `Estimated delivery: ${estimatedDeliveryAt}.`
            : ""}
        </Text>
      )}
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #364fc7",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: "#5c7cfa",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          Tracking number
        </Text>
        <Text
          style={{
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 600,
            lineHeight: "24px",
            margin: 0,
          }}
        >
          {trackingNumber}
        </Text>
      </Section>
      {trackingUrl ? (
        <Button
          href={trackingUrl}
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
          Track Shipment
        </Button>
      ) : (
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
      )}
    </BaseLayout>
  );
}
