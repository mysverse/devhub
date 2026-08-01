"use client";

import { Card, List, ListItem, Stack, Text } from "@mantine/core";
import HelpDrawerShell from "@/components/HelpDrawerShell";

export default function BonusesHelpDrawer() {
  return (
    <HelpDrawerShell triggerLabel="How bonuses work">
      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          What qualifies
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            Assigned non-PPT Linear work can become a bonus candidate when it
            has a complexity estimate and your Linear account is linked to
            DevHub. Tasks that don&apos;t qualify are listed at the bottom of
            this page with the exact reason.
          </Text>
          <List size="sm" spacing="xs">
            <ListItem>
              PPT-labeled tasks are always excluded — they pay through the PPT
              flow instead
            </ListItem>
            <ListItem>
              Canceled tasks and tasks without an estimate are excluded
            </ListItem>
            <ListItem>Some labels are excluded by admin configuration</ListItem>
          </List>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          What &ldquo;Up to X&rdquo; means
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            The amount on each card is the <strong>maximum possible</strong>,
            not a promise. Once a month, admins review completed candidates and
            decide the final amount for each task — anywhere from zero up to the
            cap. Bonuses are discretionary and never guaranteed.
          </Text>
          <Text fz="sm">
            Approved bonuses are grouped into one payment per month and
            currency, which then appears on your Transactions page.
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          The lifecycle
        </Text>
        <List size="sm" spacing="xs" type="ordered">
          <ListItem>
            <strong>Potential</strong> — the task is active and qualifies; the
            cap shows what it could pay
          </ListItem>
          <ListItem>
            <strong>In review</strong> — the task is complete and waits for the
            monthly admin review
          </ListItem>
          <ListItem>
            <strong>Approved / Rejected</strong> — the admin decision, with the
            final amount or the reason
          </ListItem>
          <ListItem>
            <strong>Paid</strong> — the grouped monthly payment went out
          </ListItem>
        </List>
      </Card>
    </HelpDrawerShell>
  );
}
