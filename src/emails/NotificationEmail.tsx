import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function NotificationEmail({
  title,
  message,
  href,
  actionLabel = "Open DevHub",
}: {
  title: string;
  message: string;
  href?: string | null;
  actionLabel?: string;
}) {
  const target = href?.startsWith("http")
    ? href
    : `${appUrl}${href?.startsWith("/") ? href : "/dashboard"}`;

  return (
    <BaseLayout previewText={title}>
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        {title}
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
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "24px",
            margin: 0,
          }}
        >
          {message}
        </Text>
      </Section>
      <Button
        href={target}
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
        {actionLabel}
      </Button>
    </BaseLayout>
  );
}
