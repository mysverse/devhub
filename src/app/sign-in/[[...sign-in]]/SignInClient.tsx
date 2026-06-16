"use client";

import { Alert, Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import { signIn } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";
import type { IntegrationAvailability } from "@/lib/integration-availability";

type Props = {
  linearAvailability: IntegrationAvailability;
};

export default function SignInClient({ linearAvailability }: Props) {
  function signInWithLinear() {
    if (!linearAvailability.configured) return;
    signIn.oauth2({
      providerId: "linear",
      callbackURL: "/onboarding",
    });
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Card withBorder radius="md" padding="xl" ta="center" maw={400}>
        <Stack gap="md">
          <div>
            <Title order={2} mb="xs">
              Sign in to {siteConfig.appName}
            </Title>
            <Text c="dimmed">Use your Linear account to sign in.</Text>
          </div>
          {!linearAvailability.configured && (
            <Alert color="yellow" title={linearAvailability.unavailableTitle}>
              {linearAvailability.unavailableDescription}
            </Alert>
          )}
          <Button
            fullWidth
            size="md"
            disabled={!linearAvailability.configured}
            onClick={signInWithLinear}
          >
            Sign in with Linear
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}
