"use client";

import { Card, List, ListItem, Stack, Text } from "@mantine/core";
import HelpDrawerShell from "@/components/HelpDrawerShell";
import {
  DEFAULT_PAYOUT_POLICY,
  describeProofRequirement,
  describeWatchPolicy,
  type PayoutPolicy,
} from "@/lib/payout-policy";

export default function PptBoardHelpDrawer({
  policy = DEFAULT_PAYOUT_POLICY,
}: {
  policy?: PayoutPolicy;
}) {
  return (
    <HelpDrawerShell triggerLabel="How the board works">
      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Claiming
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            Claiming reserves a task for you instantly — no approval needed.
            Each claim comes with a fair, disclosed deal:
          </Text>
          <List size="sm" spacing="xs">
            <ListItem>{describeWatchPolicy(policy)}</ListItem>
            <ListItem>
              Waiting on someone? Mark the task <strong>blocked</strong> to
              pause the timer (up to {policy.selfBlockHours}h) — no filler
              comments needed.
            </ListItem>
            <ListItem>
              Changed your mind? <strong>Release</strong> the task any time — it
              returns to the board and nothing is held against you.
            </ListItem>
          </List>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Getting paid
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            Move the task to Done when finished, then post proof.{" "}
            {describeProofRequirement()}
          </Text>
          <Text fz="sm">
            After a short stability window the payout is created automatically
            and appears on your Transactions page with a full explanation of
            each step.
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Taking over an assigned task
        </Text>
        <Text fz="sm">
          &ldquo;Reassign to me&rdquo; takes over someone else&apos;s task — use
          it thoughtfully. You must give a reason, and the previous assignee is
          notified with it. Their completed work stays credited to them.
        </Text>
      </Card>
    </HelpDrawerShell>
  );
}
