import {
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
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { formatAmount } from "@/lib/currency";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
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
  approvedAmount: number | null;
  status: string;
  period: string | null;
  rejectionReason: string | null;
  transaction: { status: string; paidAt: Date | null } | null;
};

const statusMeta: Record<string, { label: string; color: string }> = {
  ELIGIBLE: { label: "Potential", color: "green" },
  READY_FOR_REVIEW: { label: "Review", color: "yellow" },
  APPROVED: { label: "Approved", color: "blue" },
  REJECTED: { label: "Rejected", color: "red" },
  INELIGIBLE: { label: "Ineligible", color: "gray" },
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
  const meta = statusMeta[candidate.status] ?? statusMeta.INELIGIBLE;
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
            <Badge variant="light" color={meta.color}>
              {meta.label}
            </Badge>
          </Group>
          <Text
            fw={700}
            c={candidate.status === "REJECTED" ? "dimmed" : "green"}
          >
            {formatCandidateAmount(candidate)}
          </Text>
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
            Payout {candidate.transaction.status.toLowerCase()}
            {candidate.transaction.paidAt
              ? ` on ${candidate.transaction.paidAt.toLocaleDateString()}`
              : ""}
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
        <Card withBorder radius="md" padding="xl" ta="center">
          <Text c="dimmed">{empty}</Text>
        </Card>
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
    <Suspense fallback={<PageSkeleton />}>
      <BonusesContent />
    </Suspense>
  );
}

async function BonusesContent() {
  const { userId } = await getSession();
  if (!userId) redirect("/");

  const [candidates, approvedTransactions] = await Promise.all([
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
    <FadeIn>
      <Group justify="space-between" align="flex-start" mb="2rem" wrap="wrap">
        <div>
          <Title order={1}>Bonuses</Title>
          <Text c="dimmed" mt="xs">
            Non-guaranteed monthly payouts for eligible non-PPT Linear work.
          </Text>
        </div>
        <RefreshBonusesButton />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mb="xl">
        <Card withBorder radius="md" padding="xl">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
            Potential
          </Text>
          <Text fz="xl" fw={700}>
            {formatTotals(
              active.map((candidate) => ({
                currency: candidate.currency,
                amount: candidate.maxAmount,
              })),
            )}
          </Text>
        </Card>
        <Card withBorder radius="md" padding="xl">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
            In Review
          </Text>
          <Text fz="xl" fw={700}>
            {formatTotals(
              ready.map((candidate) => ({
                currency: candidate.currency,
                amount: candidate.maxAmount,
              })),
            )}
          </Text>
        </Card>
        <Card withBorder radius="md" padding="xl">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
            Approved
          </Text>
          <Text fz="xl" fw={700}>
            {formatTotals(
              approvedPending.map((transaction) => ({
                currency: transaction.currency,
                amount: transaction.amount,
              })),
            )}
          </Text>
        </Card>
        <Card withBorder radius="md" padding="xl">
          <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
            Paid Bonuses
          </Text>
          <Text fz="xl" fw={700}>
            {formatTotals(
              paid.map((transaction) => ({
                currency: transaction.currency,
                amount: transaction.amount,
              })),
            )}
          </Text>
        </Card>
      </SimpleGrid>

      <Stack gap="xl">
        <CandidateGrid
          title="Potential"
          candidates={active}
          empty="No active bonus candidates right now."
        />
        <CandidateGrid
          title="Ready for Review"
          candidates={ready}
          empty="No completed bonus work is waiting for admin review."
        />
        <CandidateGrid
          title="History"
          candidates={history}
          empty="No reviewed bonus items yet."
        />
      </Stack>
    </FadeIn>
  );
}
