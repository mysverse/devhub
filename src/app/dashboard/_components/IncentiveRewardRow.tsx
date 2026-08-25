import { Badge, Box, Card, Group, Stack, Text } from "@mantine/core";
import EventTrail from "@/components/EventTrail";
import LinkAnchor from "@/components/LinkAnchor";
import RelativeCountdown from "@/components/RelativeCountdown";
import StatusStepper from "@/components/StatusStepper";
import {
  explainIncentiveAward,
  INCENTIVE_EVENT_COPY,
  INCENTIVE_STEPS,
  type IncentiveOwner,
  type IncentiveTone,
} from "@/lib/incentive-explain";
import type { IncentiveRewardView } from "@/lib/incentives";
import { formatAbsoluteUtc } from "@/lib/relative-time";

const TONE_COLOR: Record<IncentiveTone, string> = {
  positive: "green",
  info: "blue",
  warning: "orange",
  critical: "red",
};

const OWNER_COPY: Record<IncentiveOwner, { label: string; color: string }> = {
  developer: { label: "Needs you", color: "yellow" },
  admin: { label: "With an admin", color: "violet" },
  automatic: { label: "Automatic", color: "gray" },
};

/**
 * One reward, told as a journey.
 *
 * Everything a developer used to have to assemble from a status badge and a
 * legend is on the row: which step it is on, whether that step is moving, when
 * it moves next, and who — if anyone — it is waiting on.
 */
export default function IncentiveRewardRow({
  reward,
}: {
  reward: IncentiveRewardView;
}) {
  const explanation = explainIncentiveAward(reward);
  const tone = TONE_COLOR[explanation.tone];
  const owner = OWNER_COPY[explanation.owner];

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={600} size="sm">
              {reward.typeLabel}
            </Text>
            <Text size="xs" c="dimmed">
              {reward.periodLabel}
            </Text>
          </Stack>
          <Stack gap={2} align="flex-end">
            <Text fw={700}>{reward.amountFormatted}</Text>
            {explanation.owner !== "automatic" && (
              <Badge size="xs" variant="light" color={owner.color}>
                {owner.label}
              </Badge>
            )}
          </Stack>
        </Group>

        {explanation.stepIndex >= 0 && (
          <Box px={4}>
            <StatusStepper
              steps={INCENTIVE_STEPS}
              currentIndex={explanation.stepIndex}
              paused={explanation.paused}
              compact
            />
          </Box>
        )}

        <Stack gap={2}>
          <Text size="sm" c={tone === "blue" ? undefined : `${tone}.4`}>
            {explanation.headline}
          </Text>
          {explanation.releasesAt ? (
            <RelativeCountdown
              target={explanation.releasesAt.toISOString()}
              // Rendered by the server until the clock takes over on the
              // client, and again once the window has passed.
              fallback={`Releases ${formatAbsoluteUtc(explanation.releasesAt)}`}
              prefix="Releases"
              size="xs"
              c="dimmed"
            />
          ) : (
            explanation.detail && (
              <Text size="xs" c="dimmed">
                {explanation.detail}
              </Text>
            )
          )}
          {explanation.releasesAt && explanation.detail && (
            <Text size="xs" c="dimmed">
              {explanation.detail}
            </Text>
          )}
        </Stack>

        {reward.transactionId && (
          <LinkAnchor href="/dashboard/transactions" size="xs">
            See the payout
          </LinkAnchor>
        )}

        {/* Only where something out of the ordinary happened: a reward moving
            normally is fully explained by the tracker above it. */}
        {(explanation.paused || explanation.stopped) && (
          <EventTrail
            events={reward.events}
            copy={INCENTIVE_EVENT_COPY}
            limit={4}
          />
        )}
      </Stack>
    </Card>
  );
}
