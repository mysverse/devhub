"use client";

import { Button, Card, Center, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";

/**
 * The body of every route segment's error.tsx.
 *
 * Segment boundaries are near-identical by nature, so the file each segment
 * has to add is five lines and the copy lives in one place. Only the actions
 * differ, and only where a segment genuinely has a better next step.
 *
 * The copy deliberately does NOT guess at a cause. `dashboard/error.tsx` used
 * to tell everyone to reconnect their Linear account, which cannot fix the
 * failure this whole body of work is about — a transient database fault — and
 * sent people to re-authorise an integration that was working fine.
 */
export default function RouteError({
  error,
  reset,
  title = "Something went wrong",
  description,
  actions,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: React.ReactNode;
  /** Extra links shown after "Try again", where a segment has a real one. */
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    // In production the message is masked and only the digest survives, which
    // is the value that matches the server log line.
    console.error("Route render error:", error.digest ?? error);
  }, [error]);

  return (
    <Center mih="60vh" p="md">
      <Card withBorder radius="md" padding="xl" ta="center" maw={460}>
        <Stack align="center" gap="md">
          <Title order={2}>{title}</Title>
          <Text c="dimmed">
            {description ??
              "This page could not be loaded. It is usually temporary — try again, and if it keeps happening it is worth reporting."}
          </Text>
          {error.digest && (
            <Text c="dimmed" fz="xs" ff="monospace">
              Reference: {error.digest}
            </Text>
          )}
          <Group justify="center" gap="sm" mt="xs">
            <Button onClick={reset}>Try again</Button>
            {actions}
          </Group>
        </Stack>
      </Card>
    </Center>
  );
}
