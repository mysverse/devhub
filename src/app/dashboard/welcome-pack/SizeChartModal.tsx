"use client";

import { Box, Modal, Stack, Text, ThemeIcon } from "@mantine/core";
import { Ruler } from "lucide-react";
import { motion } from "motion/react";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";

export default function SizeChartModal({
  opened,
  onClose,
  itemName,
  imageUrl,
}: {
  opened: boolean;
  onClose: () => void;
  itemName: string;
  imageUrl: string | null;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={2}>
          <Text fw={600}>{itemName} — Size chart</Text>
          {imageUrl && (
            <Text size="xs" c="dimmed">
              Measurements in centimetres unless noted.
            </Text>
          )}
        </Stack>
      }
      size="lg"
      centered
      radius="md"
      transitionProps={MODAL_TRANSITION}
      overlayProps={{ ...OVERLAY_PROPS }}
    >
      {imageUrl ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <Box
            style={{
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
              backgroundColor: "var(--mantine-color-dark-7)",
            }}
          >
            {/* biome-ignore lint/performance/noImgElement: uploaded charts have unknown aspect ratio; <img> preserves natural proportions */}
            <img
              src={imageUrl}
              alt={`${itemName} size chart`}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </Box>
        </motion.div>
      ) : (
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={56} radius="xl" variant="light" color="gray">
            <Ruler size={26} />
          </ThemeIcon>
          <Text c="dimmed" ta="center">
            No size chart uploaded for this item yet.
          </Text>
        </Stack>
      )}
    </Modal>
  );
}
