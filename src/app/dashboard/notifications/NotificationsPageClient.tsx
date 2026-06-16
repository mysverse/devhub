"use client";

import { Button, Card, Divider, Group, Stack } from "@mantine/core";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import NotificationItem from "@/components/notifications/NotificationItem";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import type { AppNotification } from "@/components/notifications/presentation";

export default function NotificationsPageClient({
  initialNotifications,
}: {
  initialNotifications: AppNotification[];
}) {
  const { markRead, markAllRead } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>(initialNotifications);
  const router = useRouter();

  // Sync state if initialNotifications changes (e.g. on server refresh)
  useEffect(() => {
    setItems(initialNotifications);
  }, [initialNotifications]);

  const handleSelect = async (notification: AppNotification) => {
    if (notification.readAt == null) {
      // Optimistically mark read in local state
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, readAt: nowIso } : n,
        ),
      );
      await markRead([notification.id]);
    }
    if (notification.href) {
      router.push(notification.href);
    }
  };

  const handleMarkAllRead = async () => {
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.readAt == null ? { ...n, readAt: nowIso } : n)),
    );
    await markAllRead();
  };

  const hasUnread = items.some((n) => n.readAt == null);

  if (items.length === 0) {
    return (
      <EmptyState description="You have no notifications yet." variant="card" />
    );
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        {hasUnread && (
          <Button
            variant="light"
            leftSection={<Check size={16} />}
            onClick={handleMarkAllRead}
          >
            Mark all read
          </Button>
        )}
      </Group>
      <Card withBorder radius="md" p={0}>
        <Stack gap={0}>
          <StaggerContainer>
            {items.map((notification, index) => (
              <StaggerItem key={notification.id}>
                <NotificationItem
                  notification={notification}
                  onSelect={handleSelect}
                />
                {index < items.length - 1 && <Divider />}
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Stack>
      </Card>
    </Stack>
  );
}
