"use client";

import { Text, type TextProps } from "@mantine/core";
import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/relative-time";

type Props = TextProps & {
  /** ISO instant to count down to. */
  target: string;
  /** Rendered before the clock takes over, and after the target passes. */
  fallback: string;
  /** e.g. "Releases" → "Releases in 1d 4h". */
  prefix?: string;
};

/**
 * "Releases in 1d 4h", ticking.
 *
 * The clock is read only after mount — the CampaignBanner pattern. Reading it
 * during render gives the server and the client two different answers (they run
 * in different timezones, at different instants) and React reports a hydration
 * mismatch, which is why the absolute date is rendered by the server and passed
 * in as `fallback` rather than computed here.
 */
export default function RelativeCountdown({
  target,
  fallback,
  prefix,
  ...textProps
}: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const remaining = now === null ? null : new Date(target).getTime() - now;
  const label =
    remaining === null || remaining <= 0
      ? fallback
      : `${prefix ? `${prefix} ` : ""}in ${formatRemaining(remaining)}`;

  return (
    <Text {...textProps} style={{ fontVariantNumeric: "tabular-nums" }}>
      {label}
    </Text>
  );
}
