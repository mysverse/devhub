'use client'

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import { Container, Title, Text, Group, Button, Box, AppShell } from "@mantine/core";

export default function Home() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%" display="flex" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Group gap="sm">
            <Image src="/devhub.svg" alt="DevHub" width={32} height={32} style={{ height: '32px', width: 'auto' }} />
          </Group>
          <Box>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="subtle">Sign In</Button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </Box>
        </Container>
      </AppShell.Header>

      <AppShell.Main display="flex" style={{ minHeight: 'calc(100vh - 60px)', alignItems: 'center', justifyContent: 'center' }}>
        <StaggerContainer>
          <Container size="sm" ta="center">
            <StaggerItem>
              <Title order={1} size="h1" fw={900} mb="md">
                Welcome to the Team
              </Title>
            </StaggerItem>
            <StaggerItem>
              <Text size="lg" c="dimmed" mb="xl">
                Track your PPTs, manage your payments, and find new tasks on our Linear board.
              </Text>
            </StaggerItem>
            
            <StaggerItem>
              <Group justify="center">
                <SignedIn>
                  <Button size="lg" radius="xl" component={Link} href="/dashboard">
                    Go to Dashboard
                  </Button>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button size="lg" radius="xl">
                      Join the Team
                    </Button>
                  </SignInButton>
                </SignedOut>
              </Group>
            </StaggerItem>
          </Container>
        </StaggerContainer>
      </AppShell.Main>
    </AppShell>
  );
}