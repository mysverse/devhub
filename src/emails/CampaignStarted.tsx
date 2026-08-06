import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function CampaignStarted({
  userName,
  headline,
  body,
  multiplierLabel,
  scopeLabel,
  endsAt,
  rateLine,
}: {
  userName: string;
  headline: string;
  body: string | null;
  /** "3x" — already formatted, so the email never re-derives it. */
  multiplierLabel: string;
  scopeLabel: string;
  endsAt: string;
  /** "A 5-point task pays RM300 instead of RM100." */
  rateLine: string | null;
}) {
  return (
    <BaseLayout
      previewText={`${multiplierLabel} payouts on DevHub — ${headline}`}
    >
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        {multiplierLabel} payouts are live
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        {body ??
          `${scopeLabel} are multiplied while this campaign runs. Nothing to opt into — it applies automatically.`}
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderLeft: "3px solid #7048e8",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        <Text
          style={{
            color: "#7048e8",
            fontSize: "12px",
            fontWeight: 600,
            margin: "0 0 4px 0",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          {multiplierLabel} · {scopeLabel}
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
          {headline}
        </Text>
        {rateLine && (
          <Text
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "22px",
              margin: "0 0 4px 0",
            }}
          >
            {rateLine}
          </Text>
        )}
        <Text
          style={{
            color: "#c1c2c5",
            fontSize: "14px",
            lineHeight: "22px",
            margin: 0,
          }}
        >
          Ends {new Date(endsAt).toLocaleString()}. The multiplier is locked in
          when a payout becomes eligible, so work you finish during the campaign
          still pays the promoted rate even if the payment goes out later.
        </Text>
      </Section>
      <Button
        href={`${appUrl}/dashboard/ppts`}
        style={{
          backgroundColor: "#7048e8",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          padding: "10px 24px",
          textDecoration: "none",
        }}
      >
        See what's available
      </Button>
    </BaseLayout>
  );
}
