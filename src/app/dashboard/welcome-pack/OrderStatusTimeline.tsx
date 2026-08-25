"use client";

import { Group, Stack, Text } from "@mantine/core";
import type { WelcomePackOrderStatus } from "@prisma/client";
import { Check, Inbox, PackageCheck, Truck, X } from "lucide-react";
import { motion } from "motion/react";
import type { ComponentType } from "react";
import StatusStepper from "@/components/StatusStepper";

const ACTIVE_STEPS: {
  key: WelcomePackOrderStatus;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { key: "PENDING", label: "Submitted", icon: Inbox },
  { key: "APPROVED", label: "Approved", icon: PackageCheck },
  { key: "SHIPPED", label: "Shipped", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: Check },
];

const STATUS_INDEX: Record<WelcomePackOrderStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  CANCELLED: -1,
  REJECTED: -1,
};

export default function OrderStatusTimeline({
  status,
}: {
  status: WelcomePackOrderStatus;
}) {
  const isTerminal = status === "CANCELLED" || status === "REJECTED";

  if (isTerminal) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Group
          gap="sm"
          p="md"
          style={{
            backgroundColor: "var(--mantine-color-dark-6)",
            borderRadius: "var(--mantine-radius-md)",
            borderLeft: `3px solid var(--mantine-color-${status === "REJECTED" ? "red" : "gray"}-7)`,
          }}
        >
          <X size={20} color="var(--mantine-color-gray-5)" />
          <Stack gap={0}>
            <Text fw={600}>
              {status === "REJECTED" ? "Order rejected" : "Order cancelled"}
            </Text>
            <Text size="sm" c="dimmed">
              This order won&apos;t be fulfilled.
            </Text>
          </Stack>
        </Group>
      </motion.div>
    );
  }

  const currentIndex = STATUS_INDEX[status];

  return <StatusStepper steps={ACTIVE_STEPS} currentIndex={currentIndex} />;
}
