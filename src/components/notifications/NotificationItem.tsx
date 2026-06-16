"use client";

import { Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  type AppNotification,
  notificationVisual,
  timeAgo,
} from "@/components/notifications/presentation";

type NotificationItemProps = {
  notification: AppNotification;
  /** Invoked on click — parent handles mark-read, navigation, and closing. */
  onSelect?: (notification: AppNotification) => void;
};

export default function NotificationItem({
  notification,
  onSelect,
}: NotificationItemProps) {
  const { Icon, color } = notificationVisual(
    notification.domain,
    notification.type,
  );
  const unread = notification.readAt == null;

  return (
    <UnstyledButton
      onClick={() => onSelect?.(notification)}
      style={{
        display: "block",
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--mantine-radius-sm)",
        background: unread ? "var(--mantine-color-dark-6)" : "transparent",
      }}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon
          size={18}
          color={`var(--mantine-color-${color}-4)`}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Text size="sm" fw={unread ? 700 : 600} lineClamp={1}>
              {notification.title}
            </Text>
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {timeAgo(notification.createdAt)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {notification.message}
          </Text>
        </Stack>
        {unread && (
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              marginTop: 6,
              flexShrink: 0,
              background: `var(--mantine-color-${color}-5)`,
            }}
          />
        )}
      </Group>
    </UnstyledButton>
  );
}
