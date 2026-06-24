"use client";

import { Button, Card, Center, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";

/**
 * Last-resort error boundary for the dashboard segment. Catches anything that
 * slips past a call site (including errors thrown inside Suspense) so a user
 * never sees the raw Next.js "Server Components render" box.
 *
 * It is intentionally generic: in production the underlying message is masked,
 * so auth-specific routing stays at the call sites (which see the un-masked
 * error). Here we just offer recovery actions.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error.digest ?? error);
  }, [error]);

  return (
    <Center mih="60vh" p="md">
      <Card withBorder radius="md" padding="xl" ta="center" maw={460}>
        <Stack align="center" gap="md">
          <Title order={2}>Something went wrong</Title>
          <Text c="dimmed">
            We hit a problem loading this page. Try again — if it keeps
            happening, reconnecting your Linear account usually fixes it.
          </Text>
          <Group justify="center" gap="sm" mt="xs">
            <Button onClick={reset}>Try again</Button>
            <Button
              component="a"
              href="/auth/reauth-linear?returnTo=/dashboard"
              variant="light"
            >
              Reconnect Linear
            </Button>
            <Button component="a" href="/dashboard" variant="subtle">
              Back to overview
            </Button>
          </Group>
        </Stack>
      </Card>
    </Center>
  );
}
