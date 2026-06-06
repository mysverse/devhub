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
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { LogOut } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BonusNotificationPoller from "@/components/BonusNotificationPoller";
import IncentiveNotificationPoller from "@/components/IncentiveNotificationPoller";
import { Logo } from "@/components/Logo";
import PptNotificationPoller from "@/components/PptNotificationPoller";
import { signOut, useSession } from "@/lib/auth-client";

type NavLink = { href: string; label: string };

const BASE_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/ppts", label: "PPT Board" },
  { href: "/dashboard/bonuses", label: "Bonuses" },
  { href: "/dashboard/settings", label: "HR Settings" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/welcome-pack", label: "Welcome Pack" },
];

const ADMIN_LINK: NavLink = { href: "/dashboard/admin", label: "Admin" };

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <UnstyledButton
      component={Link}
      href={link.href}
      style={{
        position: "relative",
        padding: "6px 12px",
        borderRadius: "var(--mantine-radius-md)",
        transition: "color 0.18s ease",
      }}
    >
      {active && (
        <motion.span
          layoutId="dashboard-nav-indicator"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "var(--mantine-color-blue-light)",
            zIndex: 0,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Text
        size="sm"
        fw={500}
        c={active ? "blue.4" : undefined}
        style={{ position: "relative", zIndex: 1 }}
      >
        {link.label}
      </Text>
    </UnstyledButton>
  );
}

function MobileNavLink({
  link,
  active,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <UnstyledButton
      component={Link}
      href={link.href}
      onClick={onNavigate}
      py="xs"
      px="sm"
      style={{
        position: "relative",
        borderRadius: "var(--mantine-radius-md)",
        transition: "color 0.18s ease",
      }}
    >
      {active && (
        <motion.span
          layoutId="dashboard-nav-indicator-mobile"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "var(--mantine-color-blue-light)",
            zIndex: 0,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Text
        size="sm"
        fw={500}
        c={active ? "blue.4" : undefined}
        style={{ position: "relative", zIndex: 1 }}
      >
        {link.label}
      </Text>
    </UnstyledButton>
  );
}

export default function DashboardLayoutClient({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const [opened, { toggle, close }] = useDisclosure();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const links: NavLink[] = isAdmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS;

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

            <Group gap={4} visibleFrom="sm">
              {links.map((link) => (
                <DesktopNavLink
                  key={link.href}
                  link={link}
                  active={isActive(pathname, link.href)}
                />
              ))}
            </Group>

            <Menu shadow="md" width={200} transitionProps={{ duration: 160 }}>
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
        <Stack gap={4}>
          {links.map((link) => (
            <MobileNavLink
              key={link.href}
              link={link}
              active={isActive(pathname, link.href)}
              onNavigate={close}
            />
          ))}
        </Stack>
      </AppShellNavbar>

      <AppShellMain>
        <Container size="lg" py="xl">
          {children}
        </Container>
      </AppShellMain>
      <BonusNotificationPoller />
      <IncentiveNotificationPoller />
      <PptNotificationPoller />
    </AppShell>
  );
}
