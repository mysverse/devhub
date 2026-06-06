import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function IncentiveAdminDigest({
  eventCount,
  pendingCount,
  heldCount,
  releasedCount,
  paidCount,
  headline = "Daily Incentive Digest",
  detail,
}: {
  eventCount: number;
  pendingCount: number;
  heldCount: number;
  releasedCount: number;
  paidCount: number;
  headline?: string;
  detail?: string;
}) {
  return (
    <BaseLayout previewText="DevHub incentive activity digest">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        {headline}
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        {detail ||
          `DevHub recorded ${eventCount} incentive event${eventCount === 1 ? "" : "s"} in the last 24 hours.`}
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
          New awards: {pendingCount}
        </Text>
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Held for review: {heldCount}
        </Text>
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Released or netted: {releasedCount}
        </Text>
        <Text style={{ color: "#c1c2c5", fontSize: "14px", margin: 0 }}>
          Paid: {paidCount}
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
