"use client";

import {
  Card,
  type CardProps,
  Group,
  type MantineColor,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import type { AnimateNumberProps } from "motion-plus/react";
import { AnimatedNumber } from "@/components/animations";

type StatCardProps = {
  label: string;
  /** Preformatted value (e.g. formatAmount output). Ignored if animateValue is set. */
  value?: React.ReactNode;
  /** Numeric value rendered via AnimatedNumber (animates on change). */
  animateValue?: number;
  /** Number format for animateValue, e.g. { style: "currency", currency: "MYR" }. */
  format?: AnimateNumberProps["format"];
  /** Optional leading icon, e.g. <TrendingUp size={20} />. */
  icon?: React.ReactNode;
  /** ThemeIcon color when icon is set. */
  color?: MantineColor;
  /** Small dimmed line under the value. */
  hint?: React.ReactNode;
} & Pick<CardProps, "padding" | "h">;

/**
 * Canonical stat/metric tile: uppercase dimmed label over a large value.
 * Use in SimpleGrid rows of summary stats.
 */
export default function StatCard({
  label,
  value,
  animateValue,
  format,
  icon,
  color = "blue",
  hint,
  ...cardProps
}: StatCardProps) {
  const body = (
    <Stack gap={2}>
      <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Text fz="xl" fw={700}>
        {animateValue !== undefined ? (
          <AnimatedNumber value={animateValue} format={format} />
        ) : (
          value
        )}
      </Text>
      {hint != null && (
        <Text fz="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );

  return (
    <Card withBorder {...cardProps}>
      {icon ? (
        <Group gap="md" wrap="nowrap" align="flex-start">
          <ThemeIcon size={40} variant="light" color={color}>
            {icon}
          </ThemeIcon>
          {body}
        </Group>
      ) : (
        body
      )}
    </Card>
  );
}
