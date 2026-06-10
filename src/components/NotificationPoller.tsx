"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Sparkles,
} from "lucide-react";
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

type BonusNotification = {
  id: string;
  title: string;
  identifier: string | null;
  formattedAmount: string;
};

type IncentiveNotification = {
  id: string;
  title: string;
  period: string;
  formattedAmount: string;
  status: string;
};

type NotificationResponse = {
  ppt?: PptNotification[];
  bonus?: BonusNotification[];
  incentive?: IncentiveNotification[];
};

async function markRead(ids: {
  ppt: string[];
  bonus: string[];
  incentive: string[];
}) {
  if (
    ids.ppt.length === 0 &&
    ids.bonus.length === 0 &&
    ids.incentive.length === 0
  ) {
    return;
  }

  await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids),
  }).catch(() => undefined);
}

function ToastShell({
  children,
  color,
  width = 340,
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
    <ToastShell color={color} width={360}>
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
    </ToastShell>
  );
}

function BonusToast({ notification }: { notification: BonusNotification }) {
  return (
    <ToastShell color="green">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Sparkles size={20} color="var(--mantine-color-green-4)" />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              Potential bonus
            </Text>
            {notification.identifier && (
              <Badge size="xs" variant="light" color="green">
                {notification.identifier}
              </Badge>
            )}
          </Group>
          <Text size="sm" fw={600} lineClamp={1}>
            Up to {notification.formattedAmount}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {notification.title}
          </Text>
        </Stack>
      </Group>
    </ToastShell>
  );
}

function IncentiveToast({
  notification,
}: {
  notification: IncentiveNotification;
}) {
  const held = notification.status === "HELD";
  const color = held ? "orange" : "blue";

  return (
    <ToastShell color={color}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Sparkles size={20} color={`var(--mantine-color-${color}-4)`} />
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              Incentive earned
            </Text>
            <Badge size="xs" variant="light" color={color}>
              {notification.period}
            </Badge>
          </Group>
          <Text size="sm" fw={600} lineClamp={1}>
            {notification.formattedAmount}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {notification.title}
            {held ? " is held for admin review." : " is pending release."}
          </Text>
        </Stack>
      </Group>
    </ToastShell>
  );
}

export default function NotificationPoller() {
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    let interval: number | undefined;

    async function poll() {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;

      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
        });
        if (!response.ok || !active) return;

        const data = (await response.json()) as NotificationResponse;
        const ppt = data.ppt ?? [];
        const bonus = data.bonus ?? [];
        const incentive = data.incentive ?? [];
        if (ppt.length === 0 && bonus.length === 0 && incentive.length === 0) {
          return;
        }

        for (const notification of ppt) {
          toast.custom(() => <PptToast notification={notification} />, {
            duration: 8000,
          });
        }
        for (const notification of bonus) {
          toast.custom(() => <BonusToast notification={notification} />, {
            duration: 7000,
          });
        }
        for (const notification of incentive) {
          toast.custom(() => <IncentiveToast notification={notification} />, {
            duration: 8000,
          });
        }

        await markRead({
          ppt: ppt.map((notification) => notification.id),
          bonus: bonus.map((notification) => notification.id),
          incentive: incentive.map((notification) => notification.id),
        });
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
