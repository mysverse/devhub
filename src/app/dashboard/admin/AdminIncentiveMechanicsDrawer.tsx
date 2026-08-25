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
  type AdminIncentiveSummary,
  incentiveStatusCopy,
} from "@/lib/incentive-copy";

type Props = { summary: AdminIncentiveSummary };

const LIFECYCLE = [
  "PENDING",
  "RELEASING",
  "TRANSACTION_PENDING",
  "PAID",
] as const;

// HELD is not a step on the line — it is any of the first two stopping — so it
// is described beside the chain rather than inside it. Leaving it out entirely
// (as this drawer did) made a held award look like a state the program does not
// have.
const HELD_NOTE =
  "A guardrail can hold an award at either of the first two steps. Approving it clears the caps and budgets for that award for good and releases it on the next hourly run — the review window has already been served, so it does not restart. Approval never skips the check that its counted issues still stand.";

export default function AdminIncentiveMechanicsDrawer({ summary }: Props) {
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
            Program mechanics
          </Text>
          <ArrowRight size={12} />
        </Group>
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="md"
        title="Incentive program mechanics"
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
              Activation watermark
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                The activation date is stamped the first time the program is
                enabled ({summary.activatedLabel}). Only completions observed on
                or after that moment count — nothing earned before activation is
                ever awarded.
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Weekly evaluation
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                Each ISO week (Monday to Sunday, UTC) is evaluated after it
                closes. A developer qualifies at{" "}
                <strong>{summary.weekly.threshold}</strong> qualifying tasks,
                earning <strong>{summary.weekly.myrFormatted}</strong> /{" "}
                <strong>{summary.weekly.robuxFormatted}</strong>, plus any
                active streak, milestone, leaderboard, or active-day bonuses
                that are enabled.
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Release lifecycle
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                New awards stay <strong>Pending release</strong> for the{" "}
                <strong>{summary.disputeWindowHours}-hour</strong> review
                window, then move through processing to payout:
              </Text>
              <Text fz="xs" c="dimmed">
                {HELD_NOTE}
              </Text>
              <Group gap="xs" wrap="wrap">
                {LIFECYCLE.map((status, index) => {
                  const copy = incentiveStatusCopy(status);
                  return (
                    <Group key={status} gap="xs" wrap="nowrap">
                      <Badge variant="light" color={copy.color} size="sm">
                        {copy.label}
                      </Badge>
                      {index < LIFECYCLE.length - 1 && (
                        <Text fz="xs" c="dimmed">
                          →
                        </Text>
                      )}
                    </Group>
                  );
                })}
              </Group>
              <Text fz="xs" c="dimmed">
                {summary.payoutMode.label}: {summary.payoutMode.detail}
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Held awards &amp; payout grouping
            </Text>
            <List size="sm" spacing="xs">
              <ListItem>
                Guardrails (per-user caps, program budgets, anomaly and
                no-estimate flags) move an award to <strong>Held</strong> for
                manual review. Approve to release it, or cancel to void it.
              </ListItem>
              <ListItem>
                When a group of awards is released, they batch into a single
                INCENTIVE payout transaction per developer and currency.
              </ListItem>
            </List>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Clawbacks &amp; re-running a week
            </Text>
            <List size="sm" spacing="xs">
              <ListItem>
                <strong>Net next</strong> clawbacks create an open debt that is
                offset against the developer&apos;s future incentive payouts.
              </ListItem>
              <ListItem>
                <strong>Manual adjustment</strong> clawbacks immediately record
                a negative transaction to recover a paid award.
              </ListItem>
              <ListItem>
                Re-running a week is idempotent: developers who already have an
                award for that week are skipped, never double-paid.
              </ListItem>
            </List>
          </Card>
        </Stack>
      </Drawer>
    </>
  );
}
