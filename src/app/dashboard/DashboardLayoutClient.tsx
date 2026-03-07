"use client";

import {
  AppShell,
  Avatar,
  Burger,
  Container,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { siteConfig } from "@/lib/config";

export default function DashboardLayoutClient({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const [opened, { toggle }] = useDisclosure();
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { desktop: true, mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger
                opened={opened}
                onClick={toggle}
                hiddenFrom="sm"
                size="sm"
              />
              <Link
                href="/dashboard"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Image
                  src="/devhub.svg"
                  alt={siteConfig.appName}
                  width={32}
                  height={32}
                  style={{ height: "32px", width: "auto" }}
                />
              </Link>
            </Group>

            <Group gap={20} visibleFrom="sm">
              <UnstyledButton component={Link} href="/dashboard">
                <Text size="sm" fw={500}>
                  Overview
                </Text>
              </UnstyledButton>
              <UnstyledButton component={Link} href="/dashboard/ppts">
                <Text size="sm" fw={500}>
                  PPT Board
                </Text>
              </UnstyledButton>
              <UnstyledButton component={Link} href="/dashboard/settings">
                <Text size="sm" fw={500}>
                  HR Settings
                </Text>
              </UnstyledButton>
              <UnstyledButton component={Link} href="/dashboard/documents">
                <Text size="sm" fw={500}>
                  Documents
                </Text>
              </UnstyledButton>
              {isAdmin && (
                <UnstyledButton component={Link} href="/dashboard/admin">
                  <Text size="sm" fw={500}>
                    Admin
                  </Text>
                </UnstyledButton>
              )}
            </Group>

            <Menu shadow="md" width={200}>
              <Menu.Target>
                <UnstyledButton>
                  <Avatar
                    src={session?.user?.image}
                    alt={session?.user?.name ?? "User"}
                    radius="xl"
                    size="sm"
                  />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  {session?.user?.name ?? session?.user?.email}
                </Menu.Label>
                <Menu.Item
                  leftSection={<LogOut size={14} />}
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                >
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <UnstyledButton
          component={Link}
          href="/dashboard"
          py="xs"
          onClick={toggle}
        >
          Overview
        </UnstyledButton>
        <UnstyledButton
          component={Link}
          href="/dashboard/ppts"
          py="xs"
          onClick={toggle}
        >
          PPT Board
        </UnstyledButton>
        <UnstyledButton
          component={Link}
          href="/dashboard/settings"
          py="xs"
          onClick={toggle}
        >
          HR Settings
        </UnstyledButton>
        <UnstyledButton
          component={Link}
          href="/dashboard/documents"
          py="xs"
          onClick={toggle}
        >
          Documents
        </UnstyledButton>
        {isAdmin && (
          <UnstyledButton
            component={Link}
            href="/dashboard/admin"
            py="xs"
            onClick={toggle}
          >
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
