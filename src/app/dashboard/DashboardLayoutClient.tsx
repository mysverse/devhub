"use client";

import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  Avatar,
  Burger,
  Container,
  Group,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { signOut, useSession } from "@/lib/auth-client";

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
      <AppShellHeader>
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
                <Logo size={32} />
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
              <UnstyledButton component={Link} href="/dashboard/welcome-pack">
                <Text size="sm" fw={500}>
                  Welcome Pack
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
              <MenuTarget>
                <UnstyledButton>
                  <Avatar
                    src={session?.user?.image}
                    alt={session?.user?.name ?? "User"}
                    radius="xl"
                    size="sm"
                  />
                </UnstyledButton>
              </MenuTarget>
              <MenuDropdown>
                <MenuLabel>
                  {session?.user?.name ?? session?.user?.email}
                </MenuLabel>
                <MenuItem
                  leftSection={<LogOut size={14} />}
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                >
                  Sign out
                </MenuItem>
              </MenuDropdown>
            </Menu>
          </Group>
        </Container>
      </AppShellHeader>

      <AppShellNavbar p="md">
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
        <UnstyledButton
          component={Link}
          href="/dashboard/welcome-pack"
          py="xs"
          onClick={toggle}
        >
          Welcome Pack
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
      </AppShellNavbar>

      <AppShellMain>
        <Container size="lg" py="xl">
          {children}
        </Container>
      </AppShellMain>
    </AppShell>
  );
}
