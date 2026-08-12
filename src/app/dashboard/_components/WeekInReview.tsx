import { Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import AskAssistantButton from "@/components/assistant/AskAssistantButton";
import LinkAnchor from "@/components/LinkAnchor";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount } from "@/lib/currency";
import { loadWeekInReview } from "@/lib/week-in-review";
import WeekSummaryButton from "./WeekSummaryButton";

/**
 * The last seven days, counted rather than narrated.
 *
 * Everything on this card comes from rows DevHub already has, so it renders
 * with the model unreachable, unconfigured, or capped — which is also why it is
 * not a model call: a summary on the render path of the dashboard would spend
 * once per page load, and twelve reloads would silently exhaust someone's
 * hourly budget and take PPT drafting down with it.
 *
 * Reads the session through getDashboardContext() before touching Prisma, so
 * the Cache Components rule is satisfied the same way ActiveTasksSection
 * already satisfies it.
 */

type Stat = { label: string; value: string; hint: string | null };

export default async function WeekInReview({
  userId,
  currency,
}: {
  userId: string;
  currency: CurrencyCode;
}) {
  const week = await loadWeekInReview(userId);
  const { paid, pending, proofPostedCount, waitingOnYou } = week;

  const total = (rows: { amount: number; currency: string }[]) =>
    rows
      .filter((row) => row.currency === currency)
      .reduce((sum, row) => sum + row.amount, 0);

  // Nothing happened and nothing is waiting: a card full of zeroes is worse
  // than no card, so it removes itself.
  if (
    paid.length === 0 &&
    pending.length === 0 &&
    proofPostedCount === 0 &&
    waitingOnYou.length === 0
  ) {
    return null;
  }

  const stats: Stat[] = [
    {
      label: "Paid this week",
      value: formatAmount(total(paid), currency),
      hint:
        paid.length === 1
          ? "1 payout"
          : paid.length > 1
            ? `${paid.length} payouts`
            : null,
    },
    {
      label: "In the pipeline",
      value: formatAmount(total(pending), currency),
      hint:
        pending.length === 1
          ? "1 awaiting payment"
          : pending.length > 1
            ? `${pending.length} awaiting payment`
            : null,
    },
    {
      label: "Proof posted",
      value: String(proofPostedCount),
      hint: proofPostedCount === 0 ? "nothing this week" : "in the last 7 days",
    },
    {
      label: "Waiting on you",
      value: String(waitingOnYou.length),
      hint:
        waitingOnYou.length > 0
          ? "needs proof to pay out"
          : "nothing outstanding",
    },
  ];

  return (
    <Stack gap="sm">
      {/* Wraps on purpose: the heading plus three controls is wider than a
          390px viewport, and nowrap here overflowed the page by 94px. */}
      <Group justify="space-between" align="baseline" wrap="wrap" gap="xs">
        <Text fw={700} fz="lg">
          Your week
        </Text>
        <Group gap="xs" wrap="wrap">
          <WeekSummaryButton />
          <AskAssistantButton
            entryPoint="WEEK_IN_REVIEW"
            label="Explain my week"
            prompt="Walk me through my payouts and open tasks — what got paid, what's still pending, and what's waiting on me?"
          />
          <LinkAnchor href="/dashboard/transactions" fz="sm">
            All transactions
          </LinkAnchor>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing="sm">
        {stats.map((stat) => (
          <Card key={stat.label} withBorder radius="md" padding="md">
            <Text fz="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>
              {stat.label}
            </Text>
            <Text fz={24} fw={700} mt={4} style={{ lineHeight: 1.2 }}>
              {stat.value}
            </Text>
            {stat.hint && (
              <Text fz="xs" c="dimmed" mt={2}>
                {stat.hint}
              </Text>
            )}
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
