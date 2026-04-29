"use client";

import { Modal, Text } from "@mantine/core";

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
      title={`${itemName} — Size chart`}
      size="lg"
      centered
    >
      {imageUrl ? (
        // biome-ignore lint/performance/noImgElement: uploaded charts have unknown aspect ratio; <img> preserves natural proportions
        <img
          src={imageUrl}
          alt={`${itemName} size chart`}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      ) : (
        <Text c="dimmed">No size chart uploaded for this item yet.</Text>
      )}
    </Modal>
  );
}
