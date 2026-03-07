"use client";

import { Button, Card, Center, Text, Title } from "@mantine/core";
import { signIn } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";

export default function SignInPage() {
  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Card withBorder radius="md" padding="xl" ta="center" maw={400}>
        <Title order={2} mb="xs">
          Sign in to {siteConfig.appName}
        </Title>
        <Text c="dimmed" mb="lg">
          Use your Linear account to sign in.
        </Text>
        <Button
          fullWidth
          size="md"
          onClick={() =>
            signIn.oauth2({
              providerId: "linear",
              callbackURL: "/onboarding",
            })
          }
        >
          Sign in with Linear
        </Button>
      </Card>
    </Center>
  );
}
