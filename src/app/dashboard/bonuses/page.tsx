import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Anchor,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { getSession } from "@/lib/auth-utils";
import { formatAmount } from "@/lib/currency";
import { formatMultiplier } from "@/lib/payout-campaign";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import {
  BONUS_CANDIDATE_STATUS,
  statusCopy,
  TRANSACTION_STATUS,
} from "@/lib/status-copy";
import BonusesHelpDrawer from "./BonusesHelpDrawer";
import RefreshBonusesButton from "./RefreshBonusesButton";

export const metadata: Metadata = buildSocialMetadata("/dashboard/bonuses");

type BonusCandidateCardData = {
  id: string;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
  linearIssueUrl: string | null;
  labels: string[];
  estimate: number | null;
  currency: string;
  maxAmount: number;
  /** Pre-multiplier cap, when a campaign raised this candidate's ceiling. */
  baseMaxAmount: number | null;
  campaignMultiplier: number | null;
  approvedAmount: number | null;
  status: string;
  period: string | null;
  rejectionReason: string | null;
  transaction: { status: string; paidAt: Date | null } | null;
};

function formatCandidateAmount(candidate: BonusCandidateCardData) {
  const currency = candidate.currency === "ROBUX" ? "ROBUX" : "MYR";
  if (candidate.status === "APPROVED" && candidate.approvedAmount) {
    return formatAmount(candidate.approvedAmount, currency);
  }
  return `Up to ${formatAmount(candidate.maxAmount, currency)}`;
}

function formatTotals(
  items: { currency: string; amount: number }[],
  empty = "RM0.00",
) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount);
  }
  if (totals.size === 0) return empty;
  return [...totals.entries()]
    .map(([currency, amount]) =>
      formatAmount(amount, currency === "ROBUX" ? "ROBUX" : "MYR"),
    )
    .join(" / ");
}

function BonusCandidateCard({
  candidate,
}: {
  candidate: BonusCandidateCardData;
}) {
  const meta = statusCopy(BONUS_CANDIDATE_STATUS, candidate.status);
  // A campaign raises the ceiling an admin can award, not the award itself —
  // so the badge says "cap", not a promised amount.
  const boostedCap =
    candidate.campaignMultiplier != null &&
    candidate.campaignMultiplier > 1 &&
    candidate.status !== "APPROVED" &&
    candidate.status !== "REJECTED";
  return (
    <Card withBorder radius="md" padding="lg" h="100%">
      <Stack gap="sm" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="xs">
            {candidate.linearIssueIdentifier && (
              <Badge variant="light" color="gray">
                {candidate.linearIssueIdentifier}
              </Badge>
            )}
            <StatusBadge copy={meta} />
          </Group>
          <Group gap={6} wrap="nowrap">
            {boostedCap && (
              <Badge variant="light" color="violet" size="xs">
                {formatMultiplier(candidate.campaignMultiplier ?? 1)} cap
              </Badge>
            )}
            <Text
              fw={700}
              c={candidate.status === "REJECTED" ? "dimmed" : "green"}
            >
              {formatCandidateAmount(candidate)}
            </Text>
          </Group>
        </Group>

        <Text fw={600} lineClamp={2}>
          {candidate.linearIssueTitle || "Untitled Linear issue"}
        </Text>

        <Group gap="xs">
          {candidate.estimate && (
            <Badge variant="outline" color="blue" size="sm">
              {candidate.estimate} pt
            </Badge>
          )}
          {candidate.period && (
            <Badge variant="outline" color="gray" size="sm">
              {candidate.period}
            </Badge>
          )}
          {candidate.labels.slice(0, 3).map((label) => (
            <Badge key={label} variant="dot" color="gray" size="sm">
              {label}
            </Badge>
          ))}
        </Group>

        {candidate.rejectionReason && (
          <Text size="sm" c="red">
            {candidate.rejectionReason}
          </Text>
        )}

        {candidate.status === "APPROVED" && candidate.transaction && (
          <Text size="sm" c="dimmed">
            Payout{" "}
            {statusCopy(
              TRANSACTION_STATUS,
              candidate.transaction.status,
            ).label.toLowerCase()}
            {candidate.transaction.paidAt
              ? ` on ${candidate.transaction.paidAt.toLocaleDateString()}`
              : " — grouped into the next monthly bonus payment"}
          </Text>
        )}

        {candidate.linearIssueUrl && (
          <Anchor
            href={candidate.linearIssueUrl}
            target="_blank"
            fz="sm"
            mt="auto"
          >
            Open in Linear
          </Anchor>
        )}
      </Stack>
    </Card>
  );
}

function CandidateGrid({
  title,
  candidates,
  empty,
}: {
  title: string;
  candidates: BonusCandidateCardData[];
  empty: string;
}) {
  return (
    <section>
      <Title order={2} mb="md">
        {title}
      </Title>
      {candidates.length === 0 ? (
        <EmptyState description={empty} />
      ) : (
        <StaggerContainer>
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {candidates.map((candidate) => (
              <StaggerItem key={candidate.id}>
                <BonusCandidateCard candidate={candidate} />
              </StaggerItem>
            ))}
          </SimpleGrid>
        </StaggerContainer>
      )}
    </section>
  );
}

export default function BonusesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Bonuses"
        subtitle={
          <Stack gap={6}>
            <Text c="dimmed">
              Non-guaranteed monthly payouts for eligible non-PPT Linear work.
              Admins decide final amounts at a monthly review.
            </Text>
            <BonusesHelpDrawer />
          </Stack>
        }
        action={<RefreshBonusesButton />}
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <BonusesContent />
      </Suspense>
    </PageContainer>
  );
}

async function BonusesContent() {
  const { userId } = await getSession();
  if (!userId) redirect("/");

  const [candidates, approvedTransactions, ineligible] = await Promise.all([
    prisma.bonusCandidate.findMany({
      where: {
        userId,
        status: {
          in: ["ELIGIBLE", "READY_FOR_REVIEW", "APPROVED", "REJECTED"],
        },
      },
      include: {
        transaction: {
          select: { status: true, paidAt: true },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        source: "BONUS",
        status: { in: ["PENDING", "PAID"] },
      },
      select: { amount: true, currency: true, status: true },
    }),
    prisma.bonusCandidate.findMany({
      where: { userId, status: "INELIGIBLE" },
      select: {
        id: true,
        linearIssueIdentifier: true,
        linearIssueTitle: true,
        linearIssueUrl: true,
        ineligibilityReason: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  const active = candidates.filter(
    (candidate) => candidate.status === "ELIGIBLE",
  );
  const ready = candidates.filter(
    (candidate) => candidate.status === "READY_FOR_REVIEW",
  );
  const history = candidates.filter((candidate) =>
    ["APPROVED", "REJECTED"].includes(candidate.status),
  );
  const approvedPending = approvedTransactions.filter(
    (transaction) => transaction.status === "PENDING",
  );
  const paid = approvedTransactions.filter(
    (transaction) => transaction.status === "PAID",
  );

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        <StatCard
          label="Potential"
          value={formatTotals(
            active.map((candidate) => ({
              currency: candidate.currency,
              amount: candidate.maxAmount,
            })),
          )}
          hint="Maximum possible — not guaranteed"
        />
        <StatCard
          label="In Review"
          value={formatTotals(
            ready.map((candidate) => ({
              currency: candidate.currency,
              amount: candidate.maxAmount,
            })),
          )}
          hint="Awaiting the monthly admin review"
        />
        <StatCard
          label="Approved"
          value={formatTotals(
            approvedPending.map((transaction) => ({
              currency: transaction.currency,
              amount: transaction.amount,
            })),
          )}
          hint="Confirmed — payment queued"
        />
        <StatCard
          label="Paid Bonuses"
          value={formatTotals(
            paid.map((transaction) => ({
              currency: transaction.currency,
              amount: transaction.amount,
            })),
          )}
          hint="Sent to your payout method"
        />
      </SimpleGrid>

      <CandidateGrid
        title="Potential"
        candidates={active}
        empty="No active bonus candidates right now. Assigned non-PPT tasks with an estimate qualify automatically."
      />
      <CandidateGrid
        title="In Review"
        candidates={ready}
        empty="No completed bonus work is waiting for admin review."
      />
      <CandidateGrid
        title="History"
        candidates={history}
        empty="No reviewed bonus items yet."
      />

      {ineligible.length > 0 && (
        <Accordion variant="separated" radius="md">
          <AccordionItem value="ineligible">
            <AccordionControl>
              <Text fw={600}>
                Not eligible ({ineligible.length}) — why some tasks are excluded
              </Text>
            </AccordionControl>
            <AccordionPanel>
              <Stack gap="xs">
                <Text fz="xs" c="dimmed">
                  These assigned tasks don&apos;t currently qualify for a bonus.
                  Fixing the listed reason (for example, adding an estimate)
                  makes a task eligible on the next refresh.
                </Text>
                {ineligible.map((candidate) => (
                  <Group
                    key={candidate.id}
                    gap="xs"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    {candidate.linearIssueIdentifier && (
                      <Badge size="xs" variant="light" color="gray">
                        {candidate.linearIssueIdentifier}
                      </Badge>
                    )}
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      {candidate.linearIssueUrl ? (
                        <Anchor
                          href={candidate.linearIssueUrl}
                          target="_blank"
                          fz="sm"
                          truncate="end"
                        >
                          {candidate.linearIssueTitle || "Untitled issue"}
                        </Anchor>
                      ) : (
                        <Text fz="sm" truncate="end">
                          {candidate.linearIssueTitle || "Untitled issue"}
                        </Text>
                      )}
                      <Text fz="xs" c="dimmed">
                        {candidate.ineligibilityReason ??
                          "Doesn't meet the current bonus criteria."}
                      </Text>
                    </Stack>
                  </Group>
                ))}
              </Stack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </Stack>
  );
}
