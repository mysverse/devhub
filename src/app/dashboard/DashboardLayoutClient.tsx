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
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, use } from "react";
import { Logo } from "@/components/Logo";
import NotificationPoller from "@/components/NotificationPoller";
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
      prefetch
      style={{
        position: "relative",
        padding: "6px 12px",
        borderRadius: "var(--mantine-radius-md)",
        transition: "color var(--duration-fast) var(--ease-out)",
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
      <NavLinkLabel label={link.label} active={active} />
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
      prefetch
      onClick={onNavigate}
      py="xs"
      px="sm"
      style={{
        position: "relative",
        borderRadius: "var(--mantine-radius-md)",
        transition: "color var(--duration-fast) var(--ease-out)",
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
      <NavLinkLabel label={link.label} active={active} />
    </UnstyledButton>
  );
}

function NavLinkLabel({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();

  return (
    <Text
      size="sm"
      fw={500}
      c={active ? "blue.4" : undefined}
      style={{
        position: "relative",
        zIndex: 1,
        opacity: pending ? 0.55 : 1,
        transition: "opacity var(--duration-fast) var(--ease-out)",
        transitionDelay: pending ? "150ms" : "0ms",
      }}
    >
      {label}
    </Text>
  );
}

function DesktopNavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => (
        <DesktopNavLink
          key={link.href}
          link={link}
          active={isActive(pathname, link.href)}
        />
      ))}
    </>
  );
}

function DesktopNavLinksFallback() {
  return (
    <>
      {BASE_LINKS.map((link) => (
        <DesktopNavLink key={link.href} link={link} active={false} />
      ))}
    </>
  );
}

function DesktopNavLinksWithAdmin({
  adminPromise,
}: {
  adminPromise: Promise<boolean>;
}) {
  const isAdmin = use(adminPromise);
  return (
    <DesktopNavLinks
      links={isAdmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS}
    />
  );
}

function MobileNavLinks({
  links,
  onNavigate,
}: {
  links: NavLink[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => (
        <MobileNavLink
          key={link.href}
          link={link}
          active={isActive(pathname, link.href)}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function MobileNavLinksFallback({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      {BASE_LINKS.map((link) => (
        <MobileNavLink
          key={link.href}
          link={link}
          active={false}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function MobileNavLinksWithAdmin({
  adminPromise,
  onNavigate,
}: {
  adminPromise: Promise<boolean>;
  onNavigate: () => void;
}) {
  const isAdmin = use(adminPromise);
  return (
    <MobileNavLinks
      links={isAdmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS}
      onNavigate={onNavigate}
    />
  );
}

export default function DashboardLayoutClient({
  children,
  adminPromise,
}: {
  children: React.ReactNode;
  adminPromise: Promise<boolean>;
}) {
  const [opened, { toggle, close }] = useDisclosure();
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

            <Group gap={4} visibleFrom="sm">
              <Suspense fallback={<DesktopNavLinksFallback />}>
                <DesktopNavLinksWithAdmin adminPromise={adminPromise} />
              </Suspense>
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
          <Suspense fallback={<MobileNavLinksFallback onNavigate={close} />}>
            <MobileNavLinksWithAdmin
              adminPromise={adminPromise}
              onNavigate={close}
            />
          </Suspense>
        </Stack>
      </AppShellNavbar>

      <AppShellMain>
        <Container size="lg" py="xl">
          {children}
        </Container>
      </AppShellMain>
      <NotificationPoller />
    </AppShell>
  );
}
