"use client";

import type { MantineColor } from "@mantine/core";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";

type ConfirmTone = "danger" | "warning" | "neutral";

const TONE_PRESETS: Record<
  ConfirmTone,
  { color: MantineColor; icon: ReactNode }
> = {
  danger: { color: "red", icon: <TriangleAlert size={18} /> },
  warning: { color: "yellow", icon: <TriangleAlert size={18} /> },
  neutral: { color: "blue", icon: <TriangleAlert size={18} /> },
};

export type ConfirmModalProps = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  /** Main explanation. Plain text or rich nodes. */
  description: ReactNode;
  /** Optional yellow info alert under the description. */
  hint?: ReactNode;
  /** Free-form slot rendered between description/hint and buttons (no Alert wrapper). Use for inputs like a "reason" textarea. */
  extra?: ReactNode;
  /** Visual tone — drives icon color and default confirm button color. */
  tone?: ConfirmTone;
  /** Override the icon (defaults to a triangle alert in tone color). */
  icon?: ReactNode;
  confirmLabel?: string;
  /** Override the confirm button color (otherwise inferred from tone). */
  confirmColor?: MantineColor;
  /** Optional left-section icon for the confirm button. */
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  /** True while the confirm action is in flight. Disables both buttons. */
  loading?: boolean;
};

/**
 * Polished destructive/important-action confirmation modal. Use this whenever
 * you'd reach for `window.confirm()` — gives the action weight, prevents
 * mis-clicks, and stays visually consistent with the rest of the app.
 */
export default function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  description,
  hint,
  extra,
  tone = "danger",
  icon,
  confirmLabel = "Confirm",
  confirmColor,
  confirmIcon,
  cancelLabel = "Cancel",
  loading = false,
}: ConfirmModalProps) {
  const preset = TONE_PRESETS[tone];

  return (
    <Modal
      opened={opened}
      onClose={loading ? () => {} : onClose}
      title={title}
      centered
      radius="md"
      transitionProps={MODAL_TRANSITION}
      overlayProps={{ ...OVERLAY_PROPS }}
    >
      <Stack gap="md">
        <Group align="flex-start" wrap="nowrap" gap="sm">
          <ThemeIcon color={preset.color} variant="light" size="lg" radius="md">
            {icon ?? preset.icon}
          </ThemeIcon>
          <Text size="sm" style={{ flex: 1 }}>
            {description}
          </Text>
        </Group>

        {hint && (
          <Alert color={tone === "neutral" ? "blue" : "yellow"} variant="light">
            {hint}
          </Alert>
        )}

        {extra}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            color={confirmColor ?? preset.color}
            loading={loading}
            onClick={onConfirm}
            leftSection={confirmIcon}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
