import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { Award } from "lucide-react";
import { FadeIn } from "@/components/animations";
import {
  ACHIEVEMENTS,
  type AchievementKey,
  COMPLETION_MILESTONES,
} from "@/lib/achievements";
import prisma from "@/lib/prisma";
import DashboardSectionHeader from "./DashboardSectionHeader";
import RecognitionCelebration from "./RecognitionCelebration";

/**
 * Earned achievements + exactly one "next up" hint. Deliberately quiet — this
 * is a payments tool, not a game. Also mounts the one-time celebration for
 * unseen achievements (confetti only for FIRST_PAYOUT).
 */
export default async function AchievementsCard({ userId }: { userId: string }) {
  const rows = await prisma.developerAchievement.findMany({
    where: { userId },
    orderBy: { earnedAt: "asc" },
  });
  if (rows.length === 0) return null;

  const earnedKeys = new Set(rows.map((row) => row.key));
  const unseenKeys = rows
    .filter((row) => !row.seenAt)
    .map((row) => row.key as AchievementKey);

  const completions = await prisma.issueCompletion.count({
    where: { userId },
  });
  const nextMilestone = COMPLETION_MILESTONES.find(
    (milestone) => !earnedKeys.has(milestone.key),
  );

  return (
    <FadeIn>
      <DashboardSectionHeader
        title="Achievements"
        subtitle="Earned by finishing work — visible to the whole team"
        icon={<Award size={16} />}
      />
      <Card withBorder radius="md" padding="lg" pos="relative">
        <RecognitionCelebration unseenKeys={unseenKeys} />
        <Stack gap="sm">
          <Group gap="xs" wrap="wrap">
            {rows.map((row) => {
              const definition = ACHIEVEMENTS[row.key as AchievementKey];
              if (!definition) return null;
              return (
                <Badge
                  key={row.key}
                  variant="light"
                  color="teal"
                  size="lg"
                  style={{ textTransform: "none" }}
                  title={`${definition.description} Earned ${row.earnedAt.toLocaleDateString()}.`}
                >
                  {definition.emoji} {definition.title}
                </Badge>
              );
            })}
          </Group>
          {nextMilestone && (
            <Text fz="xs" c="dimmed">
              Next up: {ACHIEVEMENTS[nextMilestone.key].emoji}{" "}
              {ACHIEVEMENTS[nextMilestone.key].title} —{" "}
              {Math.max(0, nextMilestone.count - completions)} more completed
              task
              {nextMilestone.count - completions === 1 ? "" : "s"} to go.
            </Text>
          )}
        </Stack>
      </Card>
    </FadeIn>
  );
}
