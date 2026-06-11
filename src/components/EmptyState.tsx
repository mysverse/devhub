"use client";

import { Card, type MantineColor, Stack, Text, ThemeIcon } from "@mantine/core";
import { FadeIn } from "@/components/animations";

type EmptyStateProps = {
  /** e.g. <Sparkles size={26} />. Omit for a compact text-only empty card. */
  icon?: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
  /** Optional CTA, e.g. <LinkButton …>Browse PPT Board</LinkButton>. */
  action?: React.ReactNode;
  /** ThemeIcon color. */
  color?: MantineColor;
  /**
   * "card" (default): dashed-border Card wrapper.
   * "plain": bare centered Stack, for use inside an existing Card/section.
   */
  variant?: "card" | "plain";
  /** Wrap in FadeIn. Leave off when a parent already animates entrance. */
  animated?: boolean;
};

/**
 * Canonical empty state. With an icon it renders the rich centered layout
 * (icon chip, title, description, CTA); without one it renders a compact
 * text-only empty card. Empty-state cards use a dashed border to signal
 * "nothing here yet" versus regular content cards.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  color = "blue",
  variant = "card",
  animated = false,
}: EmptyStateProps) {
  const rich = icon != null || title != null || action != null;

  const body = rich ? (
    <Stack gap="md" align="center" py={variant === "plain" ? 48 : "md"}>
      {icon && (
        <ThemeIcon size={56} radius="xl" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      )}
      <Stack gap={4} align="center">
        {title && (
          <Text fw={600} fz="lg">
            {title}
          </Text>
        )}
        {description && (
          <Text c="dimmed" fz="sm" ta="center" maw={360}>
            {description}
          </Text>
        )}
      </Stack>
      {action}
    </Stack>
  ) : (
    <Text c="dimmed" ta="center">
      {description}
    </Text>
  );

  const content =
    variant === "card" ? (
      <Card
        withBorder
        padding="xl"
        style={{ borderStyle: "dashed" }}
        ta="center"
      >
        {body}
      </Card>
    ) : (
      body
    );

  return animated ? <FadeIn>{content}</FadeIn> : content;
}
