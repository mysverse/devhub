import { Avatar, Badge, Card, Group, Stack, Text } from "@mantine/core";
import { Trophy } from "lucide-react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { getLeaderboardIssuesForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import AnimatedProgressBar from "./AnimatedProgressBar";
import DashboardSectionHeader from "./DashboardSectionHeader";

type Props = {
  userId: string;
  currentLinearId: string | null;
  currency: CurrencyCode;
};

type LeaderboardEntry = {
  linearId: string;
  name: string;
  avatarUrl: string | null;
  completedAmount: number;
  inProgressAmount: number;
  totalTasks: number;
  completedTasks: number;
};

function EmptyLeaderboard() {
  return (
    <EmptyState
      icon={<Trophy size={26} />}
      title="No leaderboard data yet"
      description="Completed and in-progress PPTs will appear here once the board gets moving."
    />
  );
}

function LeaderboardRow({
  entry,
  rank,
  rowIndex,
  maxTotal,
  isCurrentUser,
  currency,
  borderTop,
}: {
  entry: LeaderboardEntry;
  rank: number;
  rowIndex: number;
  maxTotal: number;
  isCurrentUser: boolean;
  currency: CurrencyCode;
  borderTop?: boolean;
}) {
  const total = entry.completedAmount + entry.inProgressAmount;
  const completedPct =
    maxTotal > 0 ? (entry.completedAmount / maxTotal) * 100 : 0;
  const inProgressPct =
    maxTotal > 0 ? (entry.inProgressAmount / maxTotal) * 100 : 0;

  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="md"
      style={{
        borderTop: borderTop
          ? "1px solid var(--mantine-color-default-border)"
          : undefined,
        background: isCurrentUser
          ? "linear-gradient(90deg, color-mix(in srgb, var(--mantine-color-blue-9) 22%, transparent), transparent)"
          : undefined,
        position: "relative",
      }}
    >
      {isCurrentUser && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: "var(--mantine-color-blue-5)",
          }}
        />
      )}
      <Text
        fw={700}
        fz="sm"
        c={rank <= 3 ? "blue.3" : "dimmed"}
        w={24}
        ta="center"
      >
        {rank}
      </Text>
      <Avatar src={entry.avatarUrl} radius="xl" size={36} color="blue">
        {entry.name.charAt(0).toUpperCase()}
      </Avatar>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6} style={{ minWidth: 0 }} wrap="nowrap">
            <Text fw={600} fz="sm" truncate="end">
              {entry.name}
            </Text>
            {isCurrentUser && (
              <Badge variant="light" color="blue" size="xs">
                You
              </Badge>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {entry.inProgressAmount > 0 && (
              <Text fz="xs" c="yellow.4" fw={600}>
                +{formatAmount(entry.inProgressAmount, currency)} pending
              </Text>
            )}
            <Text fw={700} fz="sm" c="green.4">
              {formatAmount(total, currency)}
            </Text>
          </Group>
        </Group>
        <AnimatedProgressBar
          completedPct={completedPct}
          inProgressPct={inProgressPct}
          delay={rowIndex * 0.08}
        />
        <Text fz="xs" c="dimmed">
          {entry.completedTasks}/{entry.totalTasks} tasks completed
        </Text>
      </Stack>
    </Group>
  );
}

export default async function Leaderboard({
  userId,
  currentLinearId,
  currency,
}: Props) {
  try {
    const issues = await getLeaderboardIssuesForUser(userId);

    const byAssignee = new Map<string, LeaderboardEntry>();
    for (const issue of issues) {
      const assignee = issue.assignee;
      if (!assignee) continue;

      const amount = issue.estimate
        ? estimateToAmount(issue.estimate, currency)
        : 0;
      const isCompleted = issue.stateType === "completed";
      const isActive =
        issue.stateType === "started" || issue.stateType === "unstarted";
      const existing = byAssignee.get(assignee.id);

      if (existing) {
        existing.totalTasks++;
        if (isCompleted) {
          existing.completedAmount += amount;
          existing.completedTasks++;
        } else if (isActive) {
          existing.inProgressAmount += amount;
        }
      } else {
        byAssignee.set(assignee.id, {
          linearId: assignee.id,
          name: assignee.displayName || assignee.name,
          avatarUrl: assignee.avatarUrl ?? null,
          completedAmount: isCompleted ? amount : 0,
          inProgressAmount: isActive && !isCompleted ? amount : 0,
          totalTasks: 1,
          completedTasks: isCompleted ? 1 : 0,
        });
      }
    }

    const sorted = [...byAssignee.values()].sort(
      (a, b) =>
        b.completedAmount +
        b.inProgressAmount -
        (a.completedAmount + a.inProgressAmount),
    );
    const maxTotal = Math.max(
      0,
      ...sorted.map((e) => e.completedAmount + e.inProgressAmount),
    );
    const topEntries = sorted.slice(0, 5);
    const currentUserIndex = currentLinearId
      ? sorted.findIndex((entry) => entry.linearId === currentLinearId)
      : -1;
    const showCurrentUserTail = currentUserIndex >= 5;

    return (
      <FadeIn>
        <DashboardSectionHeader
          title="Leaderboard"
          subtitle="PPT earnings this cycle"
          icon={<Trophy size={16} />}
        />
        {sorted.length === 0 ? (
          <EmptyLeaderboard />
        ) : (
          <Card withBorder radius="md" p={0}>
            <Stack gap={0}>
              <StaggerContainer staggerChildren={0.06} delayChildren={0.1}>
                {topEntries.map((entry, i) => (
                  <StaggerItem key={entry.linearId}>
                    <LeaderboardRow
                      entry={entry}
                      rank={i + 1}
                      rowIndex={i}
                      maxTotal={maxTotal}
                      isCurrentUser={entry.linearId === currentLinearId}
                      currency={currency}
                      borderTop={i > 0}
                    />
                  </StaggerItem>
                ))}
                {showCurrentUserTail && (
                  <>
                    <div
                      style={{
                        borderTop:
                          "1px dashed var(--mantine-color-default-border)",
                      }}
                    />
                    <StaggerItem key={sorted[currentUserIndex].linearId}>
                      <LeaderboardRow
                        entry={sorted[currentUserIndex]}
                        rank={currentUserIndex + 1}
                        rowIndex={topEntries.length}
                        maxTotal={maxTotal}
                        isCurrentUser
                        currency={currency}
                      />
                    </StaggerItem>
                  </>
                )}
              </StaggerContainer>
            </Stack>
          </Card>
        )}
      </FadeIn>
    );
  } catch (e) {
    resolveLinearFetchError(e, "/dashboard", "leaderboard");
    return null;
  }
}
