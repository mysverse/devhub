"use client";

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Card,
  Chip,
  ChipGroup,
  Flex,
  Group,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { Check, Ruler } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatedNumber, SPRING } from "@/components/animations";
import type { OrderFormPack } from "../OrderForm";

export default function PackContentsStep({
  pack,
  selectedSizes,
  onSelectSize,
  onViewSizeChart,
  sizedPickedCount,
  sizedTotal,
  invalidFlashKey,
}: {
  pack: OrderFormPack;
  selectedSizes: Record<string, string>;
  onSelectSize: (itemId: string, value: string) => void;
  onViewSizeChart: (item: { name: string; url: string | null }) => void;
  sizedPickedCount: number;
  sizedTotal: number;
  /** Increment to flash the progress card when Next fails on missing sizes. */
  invalidFlashKey: number;
}) {
  return (
    <Stack gap="md">
      <Text c="dimmed">
        These items ship in every welcome pack. Pick a size for each clothing
        item.
      </Text>
      {sizedTotal > 0 && (
        <ItemsProgress
          completed={sizedPickedCount}
          total={sizedTotal}
          invalidFlashKey={invalidFlashKey}
        />
      )}
      {pack.items.length === 0 && (
        <Alert color="yellow">No items in the pack yet.</Alert>
      )}
      <Stack gap="sm">
        {pack.items.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.soft, delay: idx * 0.05 }}
          >
            <PackItemRow
              item={item}
              selectedSize={selectedSizes[item.id] ?? ""}
              onSelectSize={(value) => onSelectSize(item.id, value)}
              onViewSizeChart={() =>
                onViewSizeChart({
                  name: item.name,
                  url: item.sizeChartBlobUrl,
                })
              }
            />
          </motion.div>
        ))}
      </Stack>
    </Stack>
  );
}

function ItemsProgress({
  completed,
  total,
  invalidFlashKey,
}: {
  completed: number;
  total: number;
  invalidFlashKey: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const done = completed === total;
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (invalidFlashKey === 0) return;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 600);
    return () => clearTimeout(timer);
  }, [invalidFlashKey]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        withBorder
        radius="md"
        p="sm"
        style={{
          borderColor: flashing ? "var(--mantine-color-orange-6)" : undefined,
          transition: "border-color var(--duration-fast) var(--ease-out)",
        }}
      >
        <Stack gap={6}>
          <Group justify="space-between" gap="xs">
            <Group gap={6}>
              <Ruler size={14} />
              <Text size="sm" fw={600}>
                Sizes
              </Text>
            </Group>
            <Group gap="xs">
              <Text
                size="sm"
                c={done ? "teal" : "dimmed"}
                fw={done ? 600 : 400}
              >
                <AnimatedNumber value={completed} /> / {total} picked
              </Text>
              <AnimatePresence>
                {done && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={SPRING.pop}
                    style={{ display: "inline-flex" }}
                  >
                    <Check
                      size={14}
                      color="var(--mantine-color-teal-5)"
                      strokeWidth={3}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Group>
          </Group>
          <Progress
            value={pct}
            size="sm"
            radius="xl"
            color={done ? "teal" : "blue"}
            transitionDuration={400}
          />
        </Stack>
      </Card>
    </motion.div>
  );
}

function PackItemRow({
  item,
  selectedSize,
  onSelectSize,
  onViewSizeChart,
}: {
  item: OrderFormPack["items"][number];
  selectedSize: string;
  onSelectSize: (value: string) => void;
  onViewSizeChart: () => void;
}) {
  const ready = item.requiresSize ? Boolean(selectedSize) : true;

  return (
    <motion.div whileHover={{ y: -2 }} transition={SPRING.snappy}>
      <Card
        withBorder
        radius="md"
        p="md"
        data-unsized-item={
          item.requiresSize && !selectedSize ? "true" : undefined
        }
        style={{
          borderColor: ready
            ? "var(--mantine-color-teal-7)"
            : "var(--mantine-color-dark-5)",
          transition: "border-color var(--duration-fast) var(--ease-out)",
        }}
      >
        <Flex
          direction={{ base: "column", sm: "row" }}
          gap="md"
          align={{ base: "stretch", sm: "flex-start" }}
        >
          <Box
            style={{
              width: 96,
              height: 96,
              borderRadius: 8,
              overflow: "hidden",
              flexShrink: 0,
              backgroundColor: "var(--mantine-color-dark-5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              position: "relative",
            }}
          >
            {item.imageBlobUrl ? (
              <Image
                src={item.imageBlobUrl}
                alt={item.name}
                width={96}
                height={96}
                style={{ objectFit: "cover" }}
                unoptimized
              />
            ) : (
              <Text size="xs" c="dimmed">
                No image
              </Text>
            )}
            <AnimatePresence>
              {ready && item.requiresSize && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={SPRING.pop}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    backgroundColor: "var(--mantine-color-teal-6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  }}
                >
                  <Check size={14} color="white" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </Box>

          <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <Stack gap={2}>
              <Text fw={600}>{item.name}</Text>
              {item.description && (
                <Text size="sm" c="dimmed">
                  {item.description}
                </Text>
              )}
            </Stack>

            {item.requiresSize ? (
              <Stack gap={6}>
                <Group
                  justify="space-between"
                  align="center"
                  wrap="wrap"
                  gap="xs"
                >
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    Size
                  </Text>
                  <Anchor
                    component="button"
                    type="button"
                    size="sm"
                    onClick={onViewSizeChart}
                  >
                    View size chart
                  </Anchor>
                </Group>
                <ChipGroup
                  value={selectedSize}
                  onChange={(v) => onSelectSize(v as string)}
                >
                  <Group gap={6}>
                    {item.sizeOptions.map((size) => (
                      <motion.div
                        key={size}
                        whileTap={{ scale: 0.92 }}
                        transition={SPRING.snappy}
                        style={{ display: "inline-flex" }}
                      >
                        <Chip value={size} size="sm" variant="outline">
                          {size}
                        </Chip>
                      </motion.div>
                    ))}
                  </Group>
                </ChipGroup>
              </Stack>
            ) : (
              <Badge variant="light" color="teal" w="fit-content">
                Included
              </Badge>
            )}
          </Stack>
        </Flex>
      </Card>
    </motion.div>
  );
}
