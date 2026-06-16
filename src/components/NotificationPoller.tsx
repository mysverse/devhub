"use client";

import { Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import { motion } from "motion/react";
import type React from "react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import {
  type AppNotification,
  notificationVisual,
} from "@/components/notifications/presentation";

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
  const { Icon, color, heading } = notificationVisual(
    notification.domain,
    notification.type,
  );

  return (
    <ToastShell color={color}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon size={20} color={`var(--mantine-color-${color}-4)`} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              {heading}
            </Text>
            <Badge size="xs" variant="light" color={color}>
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

/**
 * Shows a toast for each newly-arrived notification. Polling and read state
 * live in NotificationsProvider; this component only turns unseen items into
 * toasts and marks them seen so they don't re-toast.
 */
export default function NotificationPoller() {
  const { unseen, markSeen } = useNotifications();
  const toasted = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = unseen.filter((n) => !toasted.current.has(n.id));
    if (fresh.length === 0) return;

    for (const notification of fresh) {
      toasted.current.add(notification.id);
      toast.custom(() => <NotificationToast notification={notification} />, {
        duration: 8000,
      });
    }

    void markSeen(fresh.map((n) => n.id));
  }, [unseen, markSeen]);

  return null;
}
