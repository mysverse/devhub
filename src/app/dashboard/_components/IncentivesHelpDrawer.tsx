"use client";

import { Badge, Card, Group, List, ListItem, Stack, Text } from "@mantine/core";
import HelpDrawerShell from "@/components/HelpDrawerShell";
import type { IncentiveQualificationSummary } from "@/lib/incentive-copy";
import { INCENTIVE_STEPS } from "@/lib/incentive-explain";

type Props = { summary: IncentiveQualificationSummary };

const STEP_DETAIL: Record<string, string> = {
  earned: "The week closes and DevHub counts your qualifying tasks.",
  review: "A short window for admins to object. Usually nothing happens.",
  sending: "A payout is created and sent to your payout method.",
  paid: "The money has landed, and the payout slip is in your transactions.",
};

export default function IncentivesHelpDrawer({ summary }: Props) {
  return (
    <HelpDrawerShell triggerLabel="How incentives work">
      <Stack gap="xl">
        <Card withBorder radius="md" padding="lg">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
            What counts as a qualifying task
          </Text>
          <Stack gap="sm">
            <Text fz="sm">
              A completed Linear issue counts toward your weekly incentives when
              all of these are true:
            </Text>
            <List size="sm" spacing="xs">
              <ListItem>It is assigned to you and marked completed</ListItem>
              <ListItem>
                It has a complexity estimate of at least{" "}
                <strong>{summary.minEstimateToCount}</strong>
              </ListItem>
              <ListItem>
                It stays completed through the{" "}
                <strong>{summary.stabilityLabel}</strong> stability window
              </ListItem>
              <ListItem>It is not reassigned after completion</ListItem>
              {summary.excludedLabels.length > 0 && (
                <ListItem>
                  It is not labelled{" "}
                  {summary.excludedLabels.map((label, index) => (
                    <span key={label}>
                      {index > 0 ? ", " : ""}
                      <Badge size="xs" variant="light" color="gray">
                        {label}
                      </Badge>
                    </span>
                  ))}
                </ListItem>
              )}
            </List>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
            The weekly window
          </Text>
          <Stack gap="sm">
            <Text fz="sm">
              Each incentive week runs <strong>{summary.windowLabel}</strong>.
              You are currently in <strong>{summary.weekKey}</strong>.
            </Text>
            <Text fz="sm" fw={600} mt="xs">
              Weekly throughput rewards
            </Text>
            <Group gap="xs" wrap="wrap">
              {summary.tiers.map((tier) => (
                <Badge
                  key={tier.threshold}
                  variant="light"
                  color="blue"
                  size="lg"
                >
                  {tier.threshold} tasks = {tier.amountFormatted}
                </Badge>
              ))}
            </Group>
            <Text fz="xs" c="dimmed" mt="xs">
              Up to <strong>{summary.weeklyPotentialFormatted}</strong> this
              week, before admin review and caps.
            </Text>
          </Stack>
        </Card>

        {(summary.activeDayKickerEnabled ||
          summary.streakEnabled ||
          (summary.milestoneEnabled && summary.milestones.length > 0)) && (
          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Bonus rewards
            </Text>
            <List size="sm" spacing="xs">
              {summary.activeDayKickerEnabled &&
                summary.activeDayKickerAmountFormatted && (
                  <ListItem>
                    Stay active on <strong>{summary.activeDayThreshold}</strong>{" "}
                    days in a week to add a{" "}
                    <strong>{summary.activeDayKickerAmountFormatted}</strong>{" "}
                    active-day bonus
                  </ListItem>
                )}
              {summary.streakEnabled && summary.streakAmountFormatted && (
                <ListItem>
                  Hit the weekly target{" "}
                  <strong>{summary.streakThresholdWeeks}</strong> weeks in a row
                  for a <strong>{summary.streakAmountFormatted}</strong> streak
                  bonus
                </ListItem>
              )}
              {summary.milestoneEnabled &&
                summary.milestones.map((milestone) => (
                  <ListItem key={milestone.count}>
                    Reach <strong>{milestone.count}</strong> lifetime qualifying
                    tasks for <strong>{milestone.amountFormatted}</strong>
                  </ListItem>
                ))}
            </List>
          </Card>
        )}

        <Card withBorder radius="md" padding="lg">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
            Review and payout
          </Text>
          <Stack gap="sm">
            <Text fz="sm">
              Awards are evaluated after the week closes and then wait out a{" "}
              <strong>{summary.disputeWindowLabel}</strong> review window before
              they are released for payout.
            </Text>
            <Text fz="sm" fw={600} mt="xs">
              How a reward reaches you
            </Text>
            <Stack gap="xs">
              {INCENTIVE_STEPS.map((step, index) => (
                <Text key={step.key} fz="xs" c="dimmed">
                  <Badge variant="light" color="blue" size="sm" mr={6}>
                    {index + 1}
                  </Badge>
                  <Text span fw={600}>
                    {step.label}
                  </Text>{" "}
                  {STEP_DETAIL[step.key]}
                </Text>
              ))}
            </Stack>
            <Text fz="xs" c="dimmed">
              Every reward on your dashboard shows which of these it is on. If
              one is paused, the card says who it is waiting on.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </HelpDrawerShell>
  );
}
