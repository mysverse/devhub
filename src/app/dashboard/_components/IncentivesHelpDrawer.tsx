"use client";

import {
  Badge,
  Card,
  Drawer,
  Group,
  List,
  ListItem,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ArrowRight, HelpCircle } from "lucide-react";
import {
  type IncentiveQualificationSummary,
  incentiveStatusCopy,
} from "@/lib/incentive-copy";

type Props = { summary: IncentiveQualificationSummary };

const STATUS_LEGEND = [
  "PENDING",
  "HELD",
  "RELEASING",
  "TRANSACTION_PENDING",
  "PAID",
] as const;

export default function IncentivesHelpDrawer({ summary }: Props) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <UnstyledButton
        onClick={open}
        style={{
          color: "inherit",
          display: "inline-flex",
          width: "fit-content",
        }}
      >
        <Group gap={6}>
          <HelpCircle size={14} />
          <Text fz="sm" c="blue.4" fw={500}>
            How incentives work
          </Text>
          <ArrowRight size={12} />
        </Group>
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="md"
        title="How incentives work"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        transitionProps={{
          transition: "slide-left",
          duration: 260,
          timingFunction: "ease-out",
        }}
      >
        <Stack gap="xl">
          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              What counts as a qualifying task
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                A completed Linear issue counts toward your weekly incentives
                when all of these are true:
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
                      Stay active on{" "}
                      <strong>{summary.activeDayThreshold}</strong> days in a
                      week to add a{" "}
                      <strong>{summary.activeDayKickerAmountFormatted}</strong>{" "}
                      active-day bonus
                    </ListItem>
                  )}
                {summary.streakEnabled && summary.streakAmountFormatted && (
                  <ListItem>
                    Hit the weekly target{" "}
                    <strong>{summary.streakThresholdWeeks}</strong> weeks in a
                    row for a <strong>{summary.streakAmountFormatted}</strong>{" "}
                    streak bonus
                  </ListItem>
                )}
                {summary.milestoneEnabled &&
                  summary.milestones.map((milestone) => (
                    <ListItem key={milestone.count}>
                      Reach <strong>{milestone.count}</strong> lifetime
                      qualifying tasks for{" "}
                      <strong>{milestone.amountFormatted}</strong>
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
                <strong>{summary.disputeWindowLabel}</strong> review window
                before they are released for payout.
              </Text>
              <Text fz="sm" fw={600} mt="xs">
                What each status means
              </Text>
              <Stack gap="xs">
                {STATUS_LEGEND.map((status) => {
                  const copy = incentiveStatusCopy(status);
                  return (
                    <Group key={status} gap="xs" wrap="nowrap" align="center">
                      <Badge variant="light" color={copy.color} size="sm">
                        {copy.label}
                      </Badge>
                      <Text fz="xs" c="dimmed">
                        {copy.description}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        </Stack>
      </Drawer>
    </>
  );
}
