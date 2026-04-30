"use client";

import { Anchor, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { ExternalLink, Truck } from "lucide-react";
import { motion } from "motion/react";

export default function TrackingCard({
  trackingNumber,
  trackingUrl,
}: {
  trackingNumber: string;
  trackingUrl: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        withBorder
        radius="md"
        p="md"
        style={{
          backgroundColor: "var(--mantine-color-dark-7)",
          background:
            "linear-gradient(135deg, var(--mantine-color-dark-7), var(--mantine-color-dark-6))",
        }}
      >
        <Group align="center" gap="md" wrap="nowrap">
          <motion.div
            animate={{ x: [0, 3, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ThemeIcon
              variant="light"
              color="indigo"
              size={42}
              radius="md"
              style={{ flexShrink: 0 }}
            >
              <Truck size={22} />
            </ThemeIcon>
          </motion.div>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              Tracking number
            </Text>
            {trackingUrl ? (
              <Anchor
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                fw={500}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  wordBreak: "break-all",
                }}
              >
                {trackingNumber}
                <ExternalLink size={14} />
              </Anchor>
            ) : (
              <Text fw={500} style={{ wordBreak: "break-all" }}>
                {trackingNumber}
              </Text>
            )}
          </Stack>
        </Group>
      </Card>
    </motion.div>
  );
}
