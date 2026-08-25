import { Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { Check, Flame, Minus } from "lucide-react";
import type { StreakChip } from "@/lib/incentive-streak";

const STATE_STYLE: Record<
  StreakChip["state"],
  { border: string; background: string; color: string }
> = {
  met: {
    border: "var(--mantine-color-orange-6)",
    background: "var(--mantine-color-orange-light)",
    color: "var(--mantine-color-orange-4)",
  },
  "current-met": {
    border: "var(--mantine-color-orange-6)",
    background: "var(--mantine-color-orange-light)",
    color: "var(--mantine-color-orange-4)",
  },
  missed: {
    border: "var(--mantine-color-dark-4)",
    background: "transparent",
    color: "var(--mantine-color-dark-2)",
  },
  current: {
    border: "var(--mantine-color-blue-6)",
    background: "transparent",
    color: "var(--mantine-color-blue-4)",
  },
};

/**
 * The weeks behind the streak number.
 *
 * A bare "0 weeks" on a Tuesday is indistinguishable from "you broke your
 * streak", which is exactly how the old card read to someone who had qualified
 * two weeks running. Drawing the weeks makes the in-progress one visibly
 * different from a missed one, so the number never has to be trusted on its own.
 */
export default function IncentiveStreakStrip({
  chips,
  caption,
}: {
  chips: StreakChip[];
  caption: string;
}) {
  if (chips.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        Streak
      </Text>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Group gap={6} wrap="wrap">
          {chips.map((chip) => {
            const style = STATE_STYLE[chip.state];
            const isCurrent =
              chip.state === "current" || chip.state === "current-met";
            const label = isCurrent
              ? `${chip.label} — this week, ${chip.count} of ${chip.threshold} so far`
              : `${chip.label} — ${chip.count} of ${chip.threshold} qualifying tasks`;
            return (
              <Tooltip key={chip.weekKey} label={label} withArrow>
                <Stack gap={2} align="center">
                  <Box
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "var(--mantine-radius-sm)",
                      border: `1px ${isCurrent && chip.state === "current" ? "dashed" : "solid"} ${style.border}`,
                      background: style.background,
                      color: style.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {chip.state === "missed" ? (
                      <Minus size={14} />
                    ) : chip.state === "current" ? (
                      <Text size="xs" fw={700} c={style.color}>
                        {chip.count}
                      </Text>
                    ) : chip.state === "current-met" ? (
                      <Flame size={15} />
                    ) : (
                      <Check size={15} strokeWidth={3} />
                    )}
                  </Box>
                  <Text size="10px" c={isCurrent ? undefined : "dimmed"}>
                    {chip.label}
                  </Text>
                </Stack>
              </Tooltip>
            );
          })}
        </Group>
        <Text size="sm" c="dimmed" style={{ flex: "1 1 12rem" }}>
          {caption}
        </Text>
      </Group>
    </Stack>
  );
}
