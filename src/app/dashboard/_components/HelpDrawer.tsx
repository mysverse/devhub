"use client";

import { Badge, Card, Group, List, ListItem, Stack, Text } from "@mantine/core";
import HelpDrawerShell from "@/components/HelpDrawerShell";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount, getRateMultiplier } from "@/lib/currency";
import {
  applyMultiplier,
  type CampaignBadgeInfo,
  formatMultiplier,
} from "@/lib/payout-campaign";
import {
  DEFAULT_PAYOUT_POLICY,
  describeProofRequirement,
  describeStabilityWindow,
  describeWatchPolicy,
  type PayoutPolicy,
} from "@/lib/payout-policy";

type Props = {
  currency: CurrencyCode;
  weeklyLimit: number;
  /** Resolved server-side (env overrides applied) and threaded down. */
  policy?: PayoutPolicy;
  /** Live PPT campaign, so the rate table shows what tasks actually pay. */
  campaign?: CampaignBadgeInfo | null;
};

export default function HelpDrawer({
  currency,
  weeklyLimit,
  policy = DEFAULT_PAYOUT_POLICY,
  campaign = null,
}: Props) {
  const multiplier = getRateMultiplier(currency);
  const points = [1, 2, 3, 4, 5];

  return (
    <HelpDrawerShell triggerLabel="How payouts work">
      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Earning PPTs
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            A Linear issue generates a payout when all of these are met:
          </Text>
          <List size="sm" spacing="xs">
            <ListItem>
              Issue has a{" "}
              <Badge size="xs" variant="light">
                PPT
              </Badge>{" "}
              label
            </ListItem>
            <ListItem>Issue has a complexity estimate (1-5 points)</ListItem>
            <ListItem>Issue is marked as completed</ListItem>
            <ListItem>Issue is assigned to you</ListItem>
            <ListItem>{describeProofRequirement()}</ListItem>
            <ListItem>
              The issue stays completed through the payout stability window
            </ListItem>
          </List>
          <Text fz="sm" fw={600} mt="xs">
            Payout per point
          </Text>
          <Group gap="xs" wrap="wrap">
            {points.map((pt) => (
              <Badge
                key={pt}
                variant="light"
                color={campaign ? campaign.accentColor : "blue"}
                size="lg"
              >
                {pt}pt ={" "}
                {formatAmount(
                  campaign
                    ? applyMultiplier(
                        pt * multiplier,
                        campaign.multiplier,
                        currency,
                      )
                    : pt * multiplier,
                  currency,
                )}
              </Badge>
            ))}
          </Group>
          {campaign && (
            <Text fz="xs" c={campaign.accentColor} fw={600}>
              {campaign.name} is live: these are{" "}
              {formatMultiplier(campaign.multiplier)} the normal rate of{" "}
              {formatAmount(multiplier, currency)} per point, until{" "}
              {new Date(campaign.endsAt).toLocaleString()}. Tasks completed
              after that pay the normal rate again.
            </Text>
          )}
          <Text fz="xs" c="dimmed" mt="xs">
            <strong>Projected earnings</strong> = pending transactions +
            estimated value of your active tasks. <strong>Total Earned</strong>{" "}
            = sum of all paid transactions.
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Automated Payouts
        </Text>
        <Stack gap="sm">
          <Text fz="sm">
            Payouts within the weekly credit limit are auto-approved and paid
            after proof and the stability window pass. Payouts that exceed the
            limit aren&apos;t lost &mdash; they stay pending until an admin
            releases them manually.
          </Text>
          <List size="sm" spacing="xs">
            <ListItem>
              Weekly limit:{" "}
              <strong>{formatAmount(weeklyLimit, currency)}</strong>
            </ListItem>
            <ListItem>Week runs Monday to Sunday (UTC)</ListItem>
            <ListItem>
              Pending and paid PPT transactions count toward the limit
            </ListItem>
            <ListItem>
              If a task moves from Done back to In Progress, unpaid payouts are
              held until it is completed again with fresh proof
            </ListItem>
          </List>
          <Text fz="xs" c="dimmed" mt="xs">
            Your weekly limit resets every Monday (UTC). The ring on your hero
            shows current usage.
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Stability window
        </Text>
        <Text fz="sm">{describeStabilityWindow(policy.stabilityMinutes)}</Text>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Staying active on claimed tasks
        </Text>
        <Stack gap="sm">
          <Text fz="sm">{describeWatchPolicy(policy)}</Text>
          <Text fz="xs" c="dimmed">
            This keeps tasks moving for everyone &mdash; a returned task goes
            back to the board for anyone (including you) to claim again.
          </Text>
        </Stack>
      </Card>
    </HelpDrawerShell>
  );
}
