"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";

type PptNotification = {
  id: string;
  type: "BLOCKED" | "HELD" | "READY" | "PROOF_ACCEPTED" | "PAID_REOPENED";
  title: string;
  message: string;
  identifier: string | null;
};

async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await fetch("/api/ppts/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }).catch(() => undefined);
}

function PptToast({ notification }: { notification: PptNotification }) {
  const positive =
    notification.type === "READY" || notification.type === "PROOF_ACCEPTED";
  const color = positive
    ? "green"
    : notification.type === "HELD"
      ? "yellow"
      : "red";
  const Icon = positive
    ? CheckCircle2
    : notification.type === "HELD"
      ? PauseCircle
      : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING.pop}
      style={{
        width: 360,
        border: `1px solid var(--mantine-color-${color}-8)`,
        borderRadius: "var(--mantine-radius-md)",
        background: "var(--mantine-color-dark-7)",
        padding: "14px 16px",
        boxShadow: "var(--mantine-shadow-lg)",
      }}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon size={20} color={`var(--mantine-color-${color}-4)`} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              PPT payout update
            </Text>
            {notification.identifier && (
              <Badge size="xs" variant="light" color={color}>
                {notification.identifier}
              </Badge>
            )}
          </Group>
          <Text size="sm" fw={600} lineClamp={1}>
            {notification.title}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {notification.message}
          </Text>
        </Stack>
      </Group>
    </motion.div>
  );
}

export default function PptNotificationPoller() {
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        const response = await fetch("/api/ppts/notifications", {
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const data = (await response.json()) as {
          notifications?: PptNotification[];
        };
        const notifications = data.notifications ?? [];
        if (notifications.length === 0) return;

        for (const notification of notifications) {
          toast.custom(() => <PptToast notification={notification} />, {
            duration: 8000,
          });
        }
        await markRead(notifications.map((notification) => notification.id));
      } finally {
        inFlight.current = false;
      }
    }

    poll();
    const interval = window.setInterval(poll, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
