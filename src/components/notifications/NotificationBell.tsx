"use client";

import {
  ActionIcon,
  Anchor,
  Box,
  Divider,
  Group,
  Indicator,
  Popover,
  PopoverDropdown,
  PopoverTarget,
  ScrollAreaAutosize,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import type { AppNotification } from "@/components/notifications/presentation";

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();
  const [opened, { toggle, close }] = useDisclosure(false);
  const router = useRouter();

  const handleSelect = (notification: AppNotification) => {
    if (notification.readAt == null) void markRead([notification.id]);
    close();
    if (notification.href) router.push(notification.href);
  };

  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? toggle() : close())}
      position="bottom-end"
      width={360}
      shadow="md"
      transitionProps={{ duration: 160 }}
    >
      <PopoverTarget>
        <Indicator
          color="red"
          size={16}
          offset={4}
          disabled={unreadCount === 0}
          label={unreadCount > 9 ? "9+" : unreadCount}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Notifications"
            onClick={toggle}
          >
            <Bell size={20} />
          </ActionIcon>
        </Indicator>
      </PopoverTarget>

      <PopoverDropdown p={0}>
        <Group justify="space-between" px="sm" py="xs">
          <Text size="sm" fw={700}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Anchor component="button" size="xs" onClick={() => markAllRead()}>
              Mark all read
            </Anchor>
          )}
        </Group>
        <Divider />

        {notifications.length === 0 ? (
          <Box px="sm" py="xl">
            <Text size="sm" c="dimmed" ta="center">
              No notifications yet.
            </Text>
          </Box>
        ) : (
          <ScrollAreaAutosize mah={360} type="scroll">
            <Stack gap={2} p={6}>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onSelect={handleSelect}
                />
              ))}
            </Stack>
          </ScrollAreaAutosize>
        )}

        <Divider />
        <Box px="sm" py="xs" ta="center">
          <Anchor
            component={Link}
            href="/dashboard/notifications"
            size="xs"
            fw={600}
            onClick={close}
          >
            View all →
          </Anchor>
        </Box>
      </PopoverDropdown>
    </Popover>
  );
}
