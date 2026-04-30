"use client";

import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { motion } from "motion/react";
import Image from "next/image";

export type PackPreviewItem = {
  id: string;
  name: string;
  description: string | null;
  imageBlobUrl: string | null;
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 110, damping: 16 },
  },
};

export default function PackItemsPreview({
  items,
}: {
  items: PackPreviewItem[];
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
    >
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {items.map((item) => (
          <motion.div
            key={item.id}
            variants={ITEM_VARIANTS}
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            style={{ height: "100%" }}
          >
            <Card
              withBorder
              radius="md"
              p="md"
              h="100%"
              style={{
                overflow: "hidden",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <Stack gap="xs" h="100%">
                {item.imageBlobUrl && (
                  <div
                    style={{
                      position: "relative",
                      height: 160,
                      borderRadius: 6,
                      overflow: "hidden",
                      backgroundColor: "var(--mantine-color-dark-6)",
                    }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.06 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      style={{ position: "absolute", inset: 0 }}
                    >
                      <Image
                        src={item.imageBlobUrl}
                        alt={item.name}
                        fill
                        style={{ objectFit: "cover" }}
                        unoptimized
                      />
                    </motion.div>
                  </div>
                )}
                <Text fw={600}>{item.name}</Text>
                {item.description && (
                  <Text size="sm" c="dimmed">
                    {item.description}
                  </Text>
                )}
              </Stack>
            </Card>
          </motion.div>
        ))}
      </SimpleGrid>
    </motion.div>
  );
}
