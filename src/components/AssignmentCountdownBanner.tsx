"use client";

import { Group, Progress, Text } from "@mantine/core";
import { useEffect, useState } from "react";

type AssignmentCountdownBannerProps = {
  lastActivityAt: string;
  unassignAt: string;
  warningAt: string;
  /**
   * Server clock at render. The first paint is drawn from this on both sides
   * so the markup matches; the live clock takes over after mount.
   */
  serverNow: string;
  /** Snoozed or blocked — the clock isn't running. */
  isPaused?: boolean;
  pausedLabel?: string | null;
};

function formatRemaining(ms: number) {
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Live activity-timer countdown for a claimed task, modeled on the
 * welcome-pack ordering-window banner: the rule is always visible, escalates
 * calmly (blue → yellow → orange), and names the escape hatches.
 */
export default function AssignmentCountdownBanner({
  lastActivityAt,
  unassignAt,
  warningAt,
  serverNow,
  isPaused = false,
  pausedLabel,
}: AssignmentCountdownBannerProps) {
  // Seeded from the server clock rather than Date.now(): the progress bar
  // renders the elapsed fraction into an inline CSS variable, so reading the
  // clock during render gave the server and the client two values that differ
  // by however long the response took, and React reported a hydration mismatch
  // on every load. The real clock takes over on mount, one tick later.
  const [now, setNow] = useState(() => new Date(serverNow).getTime());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (isPaused) {
    return (
      <Text size="xs" c="orange.4">
        {pausedLabel ?? "Activity timer paused."}
      </Text>
    );
  }

  const start = new Date(lastActivityAt).getTime();
  const warnTime = new Date(warningAt).getTime();
  const endTime = new Date(unassignAt).getTime();
  const total = Math.max(1, endTime - start);
  const elapsedPct = Math.min(100, Math.max(0, ((now - start) / total) * 100));
  const remainingMs = endTime - now;
  const pastWarning = now >= warnTime;
  const color =
    remainingMs <= 12 * 60 * 60 * 1000
      ? "orange"
      : pastWarning
        ? "yellow"
        : "blue";

  return (
    <div>
      <Progress value={elapsedPct} color={color} size="xs" radius="xl" />
      <Group justify="space-between" mt={4} wrap="nowrap">
        <Text size="xs" c="dimmed">
          {remainingMs <= 0
            ? "Returning to the board — post progress to keep it"
            : `Returns to board in ${formatRemaining(remainingMs)} unless there's activity`}
        </Text>
        {!pastWarning && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            reminder in {formatRemaining(warnTime - now)}
          </Text>
        )}
      </Group>
    </div>
  );
}
