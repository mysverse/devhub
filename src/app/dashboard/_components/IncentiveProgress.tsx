import { Badge, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Flame, Gauge, Sparkles, Trophy } from "lucide-react";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  formatAwardType,
  getUserWeeklyIncentiveProgress,
} from "@/lib/incentives";
import AnimatedProgressBar from "./AnimatedProgressBar";
import DashboardSectionHeader from "./DashboardSectionHeader";

export default async function IncentiveProgress({
  userId,
}: {
  userId: string;
}) {
  const progress = await getUserWeeklyIncentiveProgress(userId);
  const completedPct =
    progress.threshold > 0
      ? Math.min(100, (progress.completedThisWeek / progress.threshold) * 100)
      : 0;

  return (
    <section>
      <DashboardSectionHeader
        title="Incentives"
        subtitle={
          progress.enabled
            ? `${progress.weekKey} activity progress`
            : "Program is currently disabled"
        }
        icon={<Sparkles size={16} />}
        badge={
          progress.enabled ? (
            <Badge variant="light" color="green">
              Active
            </Badge>
          ) : (
            <Badge variant="light" color="gray">
              Dark
            </Badge>
          )
        }
      />

      <Card withBorder radius="md" padding="lg">
        <Stack gap="lg">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>
                {progress.completedThisWeek}/{progress.threshold} qualifying
                tasks
              </Text>
              <Text size="sm" c="dimmed">
                {progress.remaining === 0
                  ? "Threshold reached"
                  : `${progress.remaining} to go`}
              </Text>
            </Group>
            <AnimatedProgressBar
              completedPct={completedPct}
              inProgressPct={0}
              delay={0}
            />
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Group gap="sm" wrap="nowrap">
              <Gauge size={18} color="var(--mantine-color-blue-4)" />
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Active days
                </Text>
                <Text fw={700}>
                  {progress.activeDaysThisWeek}
                  {progress.activeDayKickerEnabled
                    ? `/${progress.activeDayThreshold}`
                    : ""}
                </Text>
              </Stack>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Flame size={18} color="var(--mantine-color-orange-4)" />
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Streak
                </Text>
                <Text fw={700}>{progress.currentStreakWeeks} weeks</Text>
              </Stack>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Trophy size={18} color="var(--mantine-color-yellow-4)" />
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Lifetime
                </Text>
                <Text fw={700}>{progress.lifetimeCompleted} tasks</Text>
              </Stack>
            </Group>
          </SimpleGrid>

          {progress.earnedThisWeek.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={700}>
                Earned this week
              </Text>
              {progress.earnedThisWeek.map((award) => (
                <Group key={award.id} justify="space-between">
                  <Group gap="xs">
                    <Text size="sm">{formatAwardType(award.type)}</Text>
                    <Badge size="xs" variant="light">
                      {award.status.replaceAll("_", " ")}
                    </Badge>
                  </Group>
                  <Text size="sm" fw={700}>
                    {formatAmount(award.amount, award.currency as CurrencyCode)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}

          {progress.badges.length > 0 && (
            <Group gap="xs">
              {progress.badges.map((badge) => (
                <Badge key={badge} variant="light" color="blue">
                  {badge}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Card>
    </section>
  );
}
