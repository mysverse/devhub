"use client";

import {
  AppShell,
  Box,
  Button,
  Container,
  Group,
  Text,
  Title,
} from "@mantine/core";
import Image from "next/image";
import Link from "next/link";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import { signIn, useSession } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";

export default function Home() {
  const { data: session, isPending } = useSession();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container
          size="lg"
          h="100%"
          display="flex"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Group gap="sm">
            <Image
              src="/devhub.svg"
              alt={siteConfig.appName}
              width={32}
              height={32}
              style={{ height: "32px", width: "auto" }}
            />
          </Group>
          <Box>
            {!isPending && !session && (
              <Button
                variant="subtle"
                onClick={() =>
                  signIn.oauth2({
                    providerId: "linear",
                    callbackURL: "/onboarding",
                  })
                }
              >
                Sign In
              </Button>
            )}
            {session && (
              <Button variant="subtle" component={Link} href="/dashboard">
                Dashboard
              </Button>
            )}
          </Box>
        </Container>
      </AppShell.Header>

      <AppShell.Main
        display="flex"
        style={{
          minHeight: "calc(100vh - 60px)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StaggerContainer>
          <Container size="sm" ta="center">
            <StaggerItem>
              <Title order={1} size="h1" fw={900} mb="md">
                Welcome to the Team
              </Title>
            </StaggerItem>
            <StaggerItem>
              <Text size="lg" c="dimmed" mb="xl">
                Track your PPTs, manage your payments, and find new tasks on our
                Linear board.
              </Text>
            </StaggerItem>

            <StaggerItem>
              <Group justify="center">
                {session ? (
                  <Button
                    size="lg"
                    radius="xl"
                    component={Link}
                    href="/dashboard"
                  >
                    Go to Dashboard
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    radius="xl"
                    loading={isPending}
                    onClick={() =>
                      signIn.oauth2({
                        providerId: "linear",
                        callbackURL: "/onboarding",
                      })
                    }
                  >
                    Join the Team
                  </Button>
                )}
              </Group>
            </StaggerItem>
          </Container>
        </StaggerContainer>
      </AppShell.Main>
    </AppShell>
  );
}
