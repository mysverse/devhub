import { Badge, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Flame, Gauge, Sparkles, Trophy } from "lucide-react";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import type { IncentiveNextTarget } from "@/lib/incentive-copy";
import {
  formatAwardType,
  getUserWeeklyIncentiveProgress,
} from "@/lib/incentives";
import AnimatedProgressBar from "./AnimatedProgressBar";
import DashboardSectionHeader from "./DashboardSectionHeader";
import IncentivesHelpDrawer from "./IncentivesHelpDrawer";

function nextTargetIcon(kind: IncentiveNextTarget["kind"]) {
  if (kind === "streak") {
    return <Flame size={16} color="var(--mantine-color-orange-4)" />;
  }
  if (kind === "milestone") {
    return <Trophy size={16} color="var(--mantine-color-yellow-4)" />;
  }
  return <Sparkles size={16} color="var(--mantine-color-blue-4)" />;
}

export default async function IncentiveProgress({
  userId,
}: {
  userId: string;
}) {
  const progress = await getUserWeeklyIncentiveProgress(userId);

  if (!progress.enabled) {
    return (
      <section>
        <DashboardSectionHeader
          title="Incentives"
          subtitle="Program is currently disabled"
          icon={<Sparkles size={16} />}
          badge={
            <Badge variant="light" color="gray">
              Dark
            </Badge>
          }
        />
        <Card withBorder radius="md" padding="lg">
          <Stack gap="xs">
            <Text fw={700}>Incentive program is not live yet</Text>
            <Text size="sm" c="dimmed">
              When it launches, you can earn rewards for completing qualifying
              Linear tasks each week. Check back soon.
            </Text>
          </Stack>
        </Card>
      </section>
    );
  }

  const completedPct =
    progress.threshold > 0
      ? Math.min(100, (progress.completedThisWeek / progress.threshold) * 100)
      : 0;

  const hasWeeklyTarget = progress.nextTargets.some(
    (target) => target.kind === "weekly",
  );
  // The weekly next-target line already says "complete N more", so drop the
  // duplicate suggestion to keep the card low-noise.
  const suggestions = progress.suggestions.filter(
    (suggestion) => !(suggestion.id === "complete-more" && hasWeeklyTarget),
  );

  return (
    <section>
      <DashboardSectionHeader
        title="Incentives"
        subtitle={`${progress.weekKey} activity progress`}
        icon={<Sparkles size={16} />}
        badge={
          <Badge variant="light" color="green">
            Active
          </Badge>
        }
        action={<IncentivesHelpDrawer summary={progress.qualification} />}
      />

      <Card withBorder radius="md" padding="lg">
        <Stack gap="lg">
          <Stack gap="xs">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Next reward
            </Text>
            {progress.atThreshold && !hasWeeklyTarget && (
              <Group gap="xs">
                <Badge variant="light" color="green">
                  Weekly target hit
                </Badge>
                <Text size="sm" c="dimmed">
                  You have cleared this week&apos;s threshold.
                </Text>
              </Group>
            )}
            {progress.nextTargets.length > 0 ? (
              <Stack gap={6}>
                {progress.nextTargets.map((target) => (
                  <Group
                    key={target.kind}
                    gap="sm"
                    wrap="nowrap"
                    align="center"
                  >
                    {nextTargetIcon(target.kind)}
                    <Text size="sm" fw={600} style={{ flex: 1, minWidth: 0 }}>
                      {target.label}
                    </Text>
                    <Text size="xs" c="dimmed" visibleFrom="xs">
                      {target.detail}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              !progress.atThreshold && (
                <Text size="sm" c="dimmed">
                  Complete qualifying tasks this week to start earning.
                </Text>
              )
            )}
            <Text size="xs" c="dimmed">
              Up to{" "}
              <Text span fw={700}>
                {progress.earningPotential.potentialAmountFormatted}
              </Text>{" "}
              this week, before review and caps.
            </Text>
          </Stack>

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
                    <Badge
                      size="xs"
                      variant="light"
                      color={award.statusCopy.color}
                    >
                      {award.statusCopy.label}
                    </Badge>
                  </Group>
                  <Text size="sm" fw={700}>
                    {formatAmount(award.amount, award.currency as CurrencyCode)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}

          {suggestions.length > 0 && (
            <Stack gap={6}>
              {suggestions.map((suggestion) => (
                <Text key={suggestion.id} size="xs" c="dimmed">
                  <Text span fw={600}>
                    {suggestion.title}.
                  </Text>{" "}
                  {suggestion.detail}
                </Text>
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
