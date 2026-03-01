'use client'

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { AppShell, Group, Burger, Text, UnstyledButton, Container } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

export default function DashboardLayoutClient({
  children,
  isAdmin
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { desktop: true, mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Image src="/devhub.svg" alt="DevHub" width={32} height={32} style={{ height: '32px', width: 'auto' }} />
              </Link>
            </Group>

            <Group gap={20} visibleFrom="sm">
              <UnstyledButton component={Link} href="/dashboard">
                <Text size="sm" fw={500}>Overview</Text>
              </UnstyledButton>
              <UnstyledButton component={Link} href="/dashboard/ppts">
                <Text size="sm" fw={500}>PPT Board</Text>
              </UnstyledButton>
              <UnstyledButton component={Link} href="/dashboard/settings">
                <Text size="sm" fw={500}>HR Settings</Text>
              </UnstyledButton>
              {isAdmin && (
                <UnstyledButton component={Link} href="/dashboard/admin">
                  <Text size="sm" fw={500}>Admin</Text>
                </UnstyledButton>
              )}
            </Group>

            <UserButton afterSignOutUrl="/" />
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <UnstyledButton component={Link} href="/dashboard" py="xs" onClick={toggle}>
          Overview
        </UnstyledButton>
        <UnstyledButton component={Link} href="/dashboard/ppts" py="xs" onClick={toggle}>
          PPT Board
        </UnstyledButton>
        <UnstyledButton component={Link} href="/dashboard/settings" py="xs" onClick={toggle}>
          HR Settings
        </UnstyledButton>
        {isAdmin && (
          <UnstyledButton component={Link} href="/dashboard/admin" py="xs" onClick={toggle}>
            Admin
          </UnstyledButton>
        )}
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="lg" py="xl">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}