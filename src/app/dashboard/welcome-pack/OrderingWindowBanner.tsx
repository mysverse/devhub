"use client";

import { Card, Group, Text } from "@mantine/core";
import dayjs from "dayjs";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

function partsUntil(closesAt: Date, now: Date) {
  const totalSeconds = Math.max(
    0,
    Math.floor((closesAt.getTime() - now.getTime()) / 1000),
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
 * Live countdown to the ordering deadline, shown above the order form while
 * the window is open. Ticks every minute; under 24h it switches to
 * h/m/s with a 1s tick and warning colors. Purely advisory — the submit
 * action re-checks the window server-side.
 */
export default function OrderingWindowBanner({
  closesAt,
  serverNow,
}: {
  closesAt: string; // ISO
  /**
   * Server clock at render. The first paint uses it on both sides so the
   * markup matches; the live clock takes over on mount. Seeding from
   * `new Date()` during render instead gave the server and the client two
   * different countdowns and a hydration mismatch.
   */
  serverNow: string; // ISO
}) {
  const deadline = new Date(closesAt);
  const [now, setNow] = useState(() => new Date(serverNow));
  const parts = partsUntil(deadline, now);
  const underDay = parts.totalSeconds < 86_400;
  const underHour = parts.totalSeconds < 3_600;

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(
      () => setNow(new Date()),
      underDay ? 1_000 : 60_000,
    );
    return () => clearInterval(interval);
  }, [underDay]);

  if (parts.totalSeconds <= 0) return null;

  const color = underHour ? "red.5" : underDay ? "orange.5" : "dimmed";
  const countdown = underDay
    ? `${parts.hours}h ${parts.minutes}m ${parts.seconds}s`
    : `${parts.days}d ${parts.hours}h ${parts.minutes}m`;

  return (
    <Card withBorder radius="md" p="sm">
      <Group gap="xs" justify="space-between" wrap="wrap">
        <Group gap={8}>
          <Clock size={16} color="var(--mantine-color-dimmed)" />
          <Text size="sm">
            Ordering closes {dayjs(deadline).format("D MMM YYYY, HH:mm")}
          </Text>
        </Group>
        <Text
          size="sm"
          fw={600}
          c={color}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {countdown}
        </Text>
      </Group>
    </Card>
  );
}
