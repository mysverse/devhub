"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import type { WelcomePackOrderStatus } from "@prisma/client";
import { Check, CircleDashed, X } from "lucide-react";
import { motion } from "motion/react";

const ACTIVE_STEPS: { key: WelcomePackOrderStatus; label: string }[] = [
  { key: "PENDING", label: "Submitted" },
  { key: "APPROVED", label: "Approved" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "DELIVERED", label: "Delivered" },
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
    );
  }

  const currentIndex = STATUS_INDEX[status];

  return (
    <Box>
      <Group gap={0} wrap="nowrap" align="flex-start">
        {ACTIVE_STEPS.map((step, idx) => {
          const isComplete = idx <= currentIndex;
          const isCurrent = idx === currentIndex;
          const isLast = idx === ACTIVE_STEPS.length - 1;
          return (
            <Box key={step.key} style={{ flex: isLast ? 0 : 1, minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap" align="center">
                <motion.div
                  initial={false}
                  animate={
                    isComplete
                      ? { scale: 1, opacity: 1 }
                      : { scale: 0.95, opacity: 0.6 }
                  }
                  transition={{ type: "spring", stiffness: 240, damping: 22 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isComplete
                      ? "var(--mantine-color-blue-6)"
                      : "var(--mantine-color-dark-5)",
                    color: "white",
                    flexShrink: 0,
                  }}
                >
                  {isComplete ? (
                    <Check size={16} strokeWidth={3} />
                  ) : (
                    <CircleDashed size={16} />
                  )}
                </motion.div>
                {!isLast && (
                  <Box
                    style={{
                      flex: 1,
                      height: 2,
                      backgroundColor: "var(--mantine-color-dark-5)",
                      position: "relative",
                      overflow: "hidden",
                      minWidth: 12,
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: idx < currentIndex ? "100%" : "0%",
                      }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{
                        height: "100%",
                        backgroundColor: "var(--mantine-color-blue-6)",
                      }}
                    />
                  </Box>
                )}
              </Group>
              <Text
                size="xs"
                fw={isCurrent ? 600 : 400}
                c={isComplete ? undefined : "dimmed"}
                mt={6}
                style={{ whiteSpace: "nowrap" }}
              >
                {step.label}
              </Text>
            </Box>
          );
        })}
      </Group>
    </Box>
  );
}
