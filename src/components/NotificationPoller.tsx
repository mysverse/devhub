"use client";

import { Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Gift,
  Package,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";
import {
  type NotificationPresentation,
  notificationPresentation,
} from "@/lib/notifications/copy";

type AppNotification = {
  id: string;
  notificationId: string;
  domain: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
};

type NotificationResponse = {
  notifications?: AppNotification[];
};

async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }).catch(() => undefined);
}

function iconFor(
  notification: AppNotification,
  copy: NotificationPresentation,
) {
  if (copy.tone === "positive") return CheckCircle2;
  if (copy.tone === "warning") return PauseCircle;
  if (copy.tone === "critical") return AlertTriangle;
  if (notification.domain === "bonus") return Sparkles;
  if (notification.domain === "incentive") return Gift;
  if (notification.domain === "welcome_pack") return Package;
  return Bell;
}

function ToastShell({
  children,
  color,
  width = 360,
}: {
  children: React.ReactNode;
  color: string;
  width?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING.pop}
      style={{
        width,
        border: `1px solid var(--mantine-color-${color}-8)`,
        borderRadius: "var(--mantine-radius-md)",
        background: "var(--mantine-color-dark-7)",
        padding: "14px 16px",
        boxShadow: "var(--mantine-shadow-lg)",
      }}
    >
      {children}
    </motion.div>
  );
}

function NotificationToast({
  notification,
}: {
  notification: AppNotification;
}) {
  const copy = notificationPresentation(notification.domain, notification.type);
  const Icon = iconFor(notification, copy);

  return (
    <ToastShell color={copy.color}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon size={20} color={`var(--mantine-color-${copy.color}-4)`} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              {copy.heading}
            </Text>
            <Badge size="xs" variant="light" color={copy.color}>
              {notification.type.replaceAll("_", " ").toLowerCase()}
            </Badge>
          </Group>
          <Text size="sm" fw={600} lineClamp={1}>
            {notification.title}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {notification.message}
          </Text>
          {notification.href && (
            <Anchor href={notification.href} size="xs" fw={600}>
              View
            </Anchor>
          )}
        </Stack>
      </Group>
    </ToastShell>
  );
}

/** Minimum gap between polls — guards against rapid focus events hammering
 * the API. */
const MIN_POLL_GAP_MS = 5_000;

export default function NotificationPoller() {
  const inFlight = useRef(false);
  const lastPolledAt = useRef(0);

  useEffect(() => {
    let active = true;
    let interval: number | undefined;

    async function poll() {
      if (document.hidden || inFlight.current) return;
      if (Date.now() - lastPolledAt.current < MIN_POLL_GAP_MS) return;
      lastPolledAt.current = Date.now();
      inFlight.current = true;

      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });
        if (!response.ok || !active) return;

        const data = (await response.json()) as NotificationResponse;
        const notifications = data.notifications ?? [];
        if (notifications.length === 0) return;

        for (const notification of notifications) {
          toast.custom(
            () => <NotificationToast notification={notification} />,
            {
              duration: 8000,
            },
          );
        }

        await markRead(notifications.map((notification) => notification.id));
      } finally {
        inFlight.current = false;
      }
    }

    function pollWhenVisible() {
      if (!document.hidden) {
        void poll();
      }
    }

    void poll();
    interval = window.setInterval(poll, 30_000);
    window.addEventListener("focus", pollWhenVisible);
    document.addEventListener("visibilitychange", pollWhenVisible);

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      window.removeEventListener("focus", pollWhenVisible);
      document.removeEventListener("visibilitychange", pollWhenVisible);
    };
  }, []);

  return null;
}
