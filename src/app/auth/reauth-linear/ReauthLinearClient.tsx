"use client";

import {
  Alert,
  Button,
  Card,
  Center,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { signIn } from "@/lib/auth-client";
import type { IntegrationAvailability } from "@/lib/integration-availability";

function ReauthContent({
  linearAvailability,
}: {
  linearAvailability: IntegrationAvailability;
}) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const attempt = searchParams.get("attempt");
  const [failed] = useState(!!attempt);

  useEffect(() => {
    if (!attempt && linearAvailability.configured) {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: returnTo,
      });
    }
  }, [attempt, linearAvailability.configured, returnTo]);

  if (!linearAvailability.configured) {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <Card withBorder radius="md" padding="xl" ta="center" maw={400}>
          <Title order={2} mb="xs">
            Linear Sign-in Unavailable
          </Title>
          <Text c="dimmed" mb="lg">
            Your Linear connection needs attention, but Linear OAuth is not
            configured right now.
          </Text>
          <Alert color="yellow" title={linearAvailability.unavailableTitle}>
            {linearAvailability.unavailableDescription}
          </Alert>
        </Card>
      </Center>
    );
  }

  if (failed) {
    return (
      <Center h="100vh" bg="var(--mantine-color-body)">
        <Card withBorder radius="md" padding="xl" ta="center" maw={400}>
          <Title order={2} mb="xs">
            Linear Connection Failed
          </Title>
          <Text c="dimmed" mb="lg">
            We were unable to reconnect your Linear account. Please try signing
            in again.
          </Text>
          <Button
            fullWidth
            size="md"
            onClick={() =>
              signIn.oauth2({
                providerId: "linear",
                callbackURL: returnTo,
              })
            }
          >
            Retry with Linear
          </Button>
        </Card>
      </Center>
    );
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Card withBorder radius="md" padding="xl" ta="center" maw={400}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Title order={2}>Reconnecting to Linear</Title>
          <Text c="dimmed">
            Your Linear session has expired. Redirecting you to sign in
            again&hellip;
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}

export default function ReauthLinearClient({
  linearAvailability,
}: {
  linearAvailability: IntegrationAvailability;
}) {
  return (
    <Suspense
      fallback={
        <Center h="100vh" bg="var(--mantine-color-body)">
          <Loader size="lg" />
        </Center>
      }
    >
      <ReauthContent linearAvailability={linearAvailability} />
    </Suspense>
  );
}
