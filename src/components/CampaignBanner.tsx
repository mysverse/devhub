"use client";

import { ActionIcon, Card, Group, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMultiplier } from "@/lib/payout-campaign";

export type CampaignBannerData = {
  slug: string;
  name: string;
  headline: string;
  body: string | null;
  multiplier: number;
  accentColor: string;
  /** ISO strings — serialized across the RSC boundary. */
  endsAt: string;
  scopeLabel: string;
};

const DISMISS_PREFIX = "devhub:campaign-dismissed:";
const FINAL_STRETCH_MS = 24 * 60 * 60 * 1000;

function partsUntil(endsAt: Date, now: Date) {
  const totalSeconds = Math.max(
    0,
    Math.floor((endsAt.getTime() - now.getTime()) / 1000),
  );
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Dashboard-wide announcement that a payout multiplier is live, with a
 * countdown to the deadline.
 *
 * Rendered inside AppShellMain, never in the header: the header is a fixed
 * 60px single row and `pnpm visual` fails the build if anything wraps out of
 * it.
 *
 * Dismissal is per campaign slug and deliberately stops working in the last
 * 24 hours — a developer who dismissed a two-week banner on day one should
 * still be told the deadline is tonight. Purely advisory; every amount is
 * re-derived server-side.
 */
export default function CampaignBanner({
  campaign,
}: {
  campaign: CampaignBannerData | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Read the clock only after mount: the server render has no business
  // guessing the viewer's current time, and a mismatch would hydrate wrong.
  useEffect(() => {
    setNow(new Date());
    if (!campaign) return;
    setDismissed(
      window.localStorage.getItem(`${DISMISS_PREFIX}${campaign.slug}`) === "1",
    );
  }, [campaign]);

  const endsAt = campaign ? new Date(campaign.endsAt) : null;
  const parts = now && endsAt ? partsUntil(endsAt, now) : null;
  const underDay = parts ? parts.totalSeconds * 1000 < FINAL_STRETCH_MS : false;

  useEffect(() => {
    if (!campaign) return;
    const interval = setInterval(
      () => setNow(new Date()),
      underDay ? 1_000 : 60_000,
    );
    return () => clearInterval(interval);
  }, [campaign, underDay]);

  if (!campaign || !parts || parts.totalSeconds <= 0) return null;
  if (dismissed && !underDay) return null;

  const countdown = underDay
    ? `${parts.hours}h ${parts.minutes}m ${parts.seconds}s left`
    : `${parts.days}d ${parts.hours}h left`;

  function dismiss() {
    if (!campaign) return;
    window.localStorage.setItem(`${DISMISS_PREFIX}${campaign.slug}`, "1");
    setDismissed(true);
  }

  return (
    <Card
      withBorder
      radius="md"
      p="md"
      mb="lg"
      style={{
        borderColor: `var(--mantine-color-${campaign.accentColor}-6)`,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <Sparkles
            size={20}
            color={`var(--mantine-color-${campaign.accentColor}-5)`}
          />
          <Stack gap={2}>
            <Text fw={600}>
              {formatMultiplier(campaign.multiplier)} · {campaign.headline}
            </Text>
            <Text size="sm" c="dimmed">
              {campaign.body ??
                `${campaign.scopeLabel} are multiplied while this campaign runs.`}
            </Text>
            <Text size="xs" c={underDay ? "orange.5" : "dimmed"}>
              Ends {dayjs(endsAt).format("D MMM YYYY, HH:mm")} ·{" "}
              <Text
                component="span"
                size="xs"
                fw={600}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {countdown}
              </Text>
            </Text>
          </Stack>
        </Group>

        {!underDay && (
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Dismiss campaign banner"
            onClick={dismiss}
          >
            <X size={16} />
          </ActionIcon>
        )}
      </Group>
    </Card>
  );
}
