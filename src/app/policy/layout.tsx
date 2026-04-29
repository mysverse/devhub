"use client";

import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Box,
  Button,
  Container,
  Group,
} from "@mantine/core";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { signIn, useSession } from "@/lib/auth-client";

export default function PolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShellHeader>
        <Container
          size="lg"
          h="100%"
          display="flex"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Group gap="sm">
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                color: "inherit",
              }}
            >
              <Logo size={32} />
            </Link>
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
      </AppShellHeader>

      <AppShellMain>{children}</AppShellMain>
    </AppShell>
  );
}
