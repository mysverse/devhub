import { Button, Section, Text } from "@react-email/components";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PptPayoutAdminDigest({
  eventCount,
  blockedCount,
  readyCount,
  heldCount,
}: {
  eventCount: number;
  blockedCount: number;
  readyCount: number;
  heldCount: number;
}) {
  return (
    <BaseLayout previewText="Daily PPT payout digest">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Daily PPT Payout Digest
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        DevHub recorded {eventCount} PPT payout eligibility event
        {eventCount === 1 ? "" : "s"} in the last 24 hours.
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
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Blocked: {blockedCount}
        </Text>
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Ready or created: {readyCount}
        </Text>
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Held or reopened: {heldCount}
        </Text>
      </Section>
      <Button
        href={`${appUrl}/dashboard/admin`}
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
        Open Admin Dashboard
      </Button>
    </BaseLayout>
  );
}
