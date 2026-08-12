import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import type { Prisma, Transaction } from "@prisma/client";
import { ArrowRight, Download, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import InfoTip from "@/components/InfoTip";
import LinkAnchor from "@/components/LinkAnchor";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import PayoutTimeline from "@/components/PayoutTimeline";
import StatusBadge from "@/components/StatusBadge";
import { getSession } from "@/lib/auth-utils";
import { formatBonusPeriod } from "@/lib/bonus";
import { getUserWeeklyUsage } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount, getCurrencyForPaymentMethod } from "@/lib/currency";
import { PPT_OWNER_COPY } from "@/lib/ppt-reason-copy";
import prisma from "@/lib/prisma";
import { PAYOUT_STATUS_SELECT } from "@/lib/prisma-select";
import { buildSocialMetadata } from "@/lib/social-previews";
import { statusCopy, TRANSACTION_STATUS } from "@/lib/status-copy";
import { explainTransaction } from "@/lib/transaction-explain";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/transactions",
);

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
  { key: "all", label: "All", statuses: null },
  { key: "pending", label: "Pending", statuses: ["PENDING"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  { key: "on_hold", label: "On hold", statuses: ["ON_HOLD"] },
  {
    key: "closed",
    label: "Rejected / Cancelled",
    statuses: ["REJECTED", "CANCELLED"],
  },
] as const;

type FilterKey = (typeof STATUS_FILTERS)[number]["key"];

function toCurrencyCode(currency: string): CurrencyCode {
  return currency === "ROBUX" ? "ROBUX" : "MYR";
}

function getTransactionTitle(tx: Transaction) {
  if (tx.source === "BONUS") {
    return tx.linearIssueTitle ?? `${formatBonusPeriod(tx.bonusPeriod)} Bonus`;
  }
  if (tx.source === "INCENTIVE") {
    return tx.linearIssueTitle ?? "DevHub incentive awards";
  }
  if (tx.linearIssueId) {
    return tx.linearIssueTitle ?? tx.linearIssueIdentifier ?? tx.linearIssueId;
  }
  return "Manual payout (created by an admin)";
}

function getSourceMeta(
  source: Transaction["source"],
): { label: string; color: string } | null {
  if (source === "INCENTIVE") return { label: "Incentive", color: "blue" };
  if (source === "BONUS") return { label: "Bonus", color: "grape" };
  if (source === "MANUAL") return { label: "Manual", color: "gray" };
  return null;
}

const TONE_COLORS: Record<string, string> = {
  positive: "green",
  info: "blue",
  warning: "yellow",
  critical: "red",
};

export default function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <PageContainer>
      <PageHeader
        title="Transactions"
        subtitle="Every payout DevHub has created for you, with the reason behind its current status."
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <TransactionsContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function TransactionsContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { userId } = await getSession();
  if (!userId) redirect("/");

  const params = await searchParams;
  const filterKey = (
    STATUS_FILTERS.some((f) => f.key === params.status) ? params.status : "all"
  ) as FilterKey;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const filter = STATUS_FILTERS.find((f) => f.key === filterKey);
  const where: Prisma.TransactionWhereInput = {
    userId,
    ...(filter?.statuses
      ? { status: { in: [...filter.statuses] as Transaction["status"][] } }
      : {}),
  };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { paymentMethod: true },
  });
  const currency = getCurrencyForPaymentMethod(profile?.paymentMethod ?? "");

  const [total, rows, weeklyUsage] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        payout: { select: PAYOUT_STATUS_SELECT },
        pptPayoutState: {
          select: {
            status: true,
            reason: true,
            events: {
              select: { id: true, type: true, createdAt: true },
              orderBy: { createdAt: "asc" },
              take: 30,
            },
          },
        },
        // Names the campaign in the "RM20 x 3x (Raya Sprint)" breakdown.
        campaignApplications: {
          select: { campaign: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getUserWeeklyUsage(userId, currency),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const usagePct =
    weeklyUsage.limit > 0 ? (weeklyUsage.used / weeklyUsage.limit) * 100 : 0;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" wrap="wrap" gap="md">
          <Stack gap={4} style={{ flex: 1, minWidth: 220 }}>
            <Group gap={4}>
              <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
                Weekly auto-approval credit
              </Text>
              <InfoTip term="weeklyCredit" />
            </Group>
            <Progress
              value={Math.min(usagePct, 100)}
              color={
                usagePct >= 100 ? "red" : usagePct >= 70 ? "yellow" : "green"
              }
              size="sm"
            />
            <Text fz="xs" c="dimmed">
              {formatAmount(weeklyUsage.used, currency)} of{" "}
              {formatAmount(weeklyUsage.limit, currency)} used — payouts past
              the limit wait for an admin and resume counting next Monday (UTC).
            </Text>
          </Stack>
          <Group gap={6} wrap="wrap">
            {STATUS_FILTERS.map((f) => (
              <LinkAnchor
                key={f.key}
                href={
                  f.key === "all"
                    ? "/dashboard/transactions"
                    : `/dashboard/transactions?status=${f.key}`
                }
                style={{ textDecoration: "none" }}
              >
                <Badge
                  variant={f.key === filterKey ? "filled" : "light"}
                  color="blue"
                  size="lg"
                  style={{ cursor: "pointer", textTransform: "none" }}
                >
                  {f.label}
                </Badge>
              </LinkAnchor>
            ))}
          </Group>
        </Group>
      </Card>

      <Card withBorder radius="md" p={0}>
        {rows.length === 0 ? (
          <EmptyState
            variant="plain"
            icon={<Receipt size={26} />}
            color="gray"
            title="No transactions here yet"
            description="Complete a PPT and its payout will appear with a full explanation of each step."
            action={
              <LinkButton
                href="/dashboard/ppts"
                variant="light"
                rightSection={<ArrowRight size={14} />}
              >
                Find a task
              </LinkButton>
            }
          />
        ) : (
          <Stack gap={0}>
            <StaggerContainer staggerChildren={0.03} delayChildren={0}>
              {rows.map((tx, i) => {
                const copy = statusCopy(TRANSACTION_STATUS, tx.status);
                const explanation = explainTransaction({
                  ...tx,
                  campaignName:
                    tx.campaignApplications[0]?.campaign.name ?? null,
                });
                const ownerCopy = explanation.owner
                  ? PPT_OWNER_COPY[explanation.owner]
                  : null;
                const rowCurrency = toCurrencyCode(tx.currency);
                const sourceMeta = getSourceMeta(tx.source);

                return (
                  <StaggerItem key={tx.id}>
                    <Stack
                      gap={6}
                      p="md"
                      style={{
                        borderTop:
                          i > 0
                            ? "1px solid var(--mantine-color-default-border)"
                            : undefined,
                      }}
                    >
                      <Group gap="md" wrap="nowrap" align="flex-start">
                        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                          <Group gap="xs" wrap="nowrap">
                            {tx.linearIssueUrl ? (
                              <Anchor
                                href={tx.linearIssueUrl}
                                target="_blank"
                                fz="sm"
                                fw={600}
                                truncate="end"
                              >
                                {getTransactionTitle(tx)}
                              </Anchor>
                            ) : (
                              <Text fz="sm" fw={600} truncate="end">
                                {getTransactionTitle(tx)}
                              </Text>
                            )}
                            {tx.linearIssueIdentifier && (
                              <Badge size="xs" variant="default" color="gray">
                                {tx.linearIssueIdentifier}
                              </Badge>
                            )}
                          </Group>
                          <Group gap="xs" wrap="wrap">
                            <StatusBadge copy={copy} size="xs" />
                            {sourceMeta && (
                              <Badge
                                variant="light"
                                color={sourceMeta.color}
                                size="xs"
                              >
                                {sourceMeta.label}
                              </Badge>
                            )}
                            {tx.autoApproved && tx.source === "PPT" && (
                              <Badge variant="outline" color="green" size="xs">
                                Auto-approved
                              </Badge>
                            )}
                            {ownerCopy && tx.status !== "PAID" && (
                              <Badge
                                variant="outline"
                                color={ownerCopy.color}
                                size="xs"
                              >
                                {ownerCopy.label}
                              </Badge>
                            )}
                            <Text fz="xs" c="dimmed">
                              {tx.createdAt.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                          </Group>
                        </Stack>
                        <Stack gap={2} align="flex-end">
                          <Text fw={700} fz="sm">
                            {tx.status === "PAID" ? "+" : ""}
                            {formatAmount(tx.amount, rowCurrency)}
                          </Text>
                          {explanation.campaignBreakdown && (
                            <Text fz="xs" c="violet" ta="right">
                              {explanation.campaignBreakdown}
                            </Text>
                          )}
                          <Anchor
                            href={`/api/transactions/${tx.id}/pdf`}
                            fz="xs"
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Download size={12} /> Slip
                          </Anchor>
                        </Stack>
                      </Group>
                      {tx.status !== "PAID" && (
                        <Alert
                          color={TONE_COLORS[explanation.tone] ?? "blue"}
                          p="xs"
                          radius="sm"
                        >
                          <Text fz="xs" fw={600}>
                            {explanation.headline}
                          </Text>
                          {explanation.detail && (
                            <Text fz="xs" c="dimmed" mt={2}>
                              {explanation.detail}
                            </Text>
                          )}
                        </Alert>
                      )}
                      {tx.pptPayoutState?.events &&
                        tx.pptPayoutState.events.length > 0 && (
                          <PayoutTimeline events={tx.pptPayoutState.events} />
                        )}
                    </Stack>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </Stack>
        )}
      </Card>

      {pageCount > 1 && (
        <Group justify="space-between">
          <Text fz="sm" c="dimmed">
            Page {page} of {pageCount} · {total} transaction
            {total === 1 ? "" : "s"}
          </Text>
          <Group gap="xs">
            {page > 1 && (
              <LinkAnchor
                href={`/dashboard/transactions?status=${filterKey}&page=${page - 1}`}
                fz="sm"
                fw={600}
              >
                &larr; Newer
              </LinkAnchor>
            )}
            {page < pageCount && (
              <LinkAnchor
                href={`/dashboard/transactions?status=${filterKey}&page=${page + 1}`}
                fz="sm"
                fw={600}
              >
                Older &rarr;
              </LinkAnchor>
            )}
          </Group>
        </Group>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card withBorder radius="md" padding="md">
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
            Why do some payouts wait for review?
          </Text>
          <Text fz="sm" c="dimmed">
            Payouts within your weekly credit limit are sent automatically.
            Anything past the limit waits for an admin to release it — it is
            never lost, and the limit resets every Monday (UTC).
          </Text>
        </Card>
        <Card withBorder radius="md" padding="md">
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
            Something look wrong?
          </Text>
          <Text fz="sm" c="dimmed">
            Every status above explains its next step and who it&apos;s waiting
            on. If a payment seems stuck beyond that, reach out to an admin with
            the transaction slip.
          </Text>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
