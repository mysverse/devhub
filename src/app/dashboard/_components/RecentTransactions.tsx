import {
  Anchor,
  Badge,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import type { Transaction } from "@prisma/client";
import {
  CheckCircle2,
  Circle,
  Clock,
  Download,
  PauseCircle,
  Receipt,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import LinkAnchor from "@/components/LinkAnchor";
import StatusBadge from "@/components/StatusBadge";
import { formatBonusPeriod } from "@/lib/bonus";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount } from "@/lib/currency";
import prisma from "@/lib/prisma";
import { PAYOUT_STATUS_SELECT } from "@/lib/prisma-select";
import { statusCopy, TRANSACTION_STATUS } from "@/lib/status-copy";
import { explainTransaction } from "@/lib/transaction-explain";
import DashboardSectionHeader from "./DashboardSectionHeader";
import styles from "./RecentTransactions.module.css";

type Props = { userId: string };

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

  return "Manual Payout";
}

function getSourceMeta(
  source: Transaction["source"],
): { label: string; color: string } | null {
  if (source === "INCENTIVE") return { label: "Incentive", color: "blue" };
  if (source === "BONUS") return { label: "Bonus", color: "grape" };
  return null;
}

// Icons and amount tinting are presentation-specific to this list; the badge
// color itself comes from the shared TRANSACTION_STATUS map.
function getStatusMeta(status: Transaction["status"]): {
  color: string;
  amountColor: string;
  icon: ReactNode;
} {
  const color = statusCopy(TRANSACTION_STATUS, status).color;

  if (status === "PAID") {
    return {
      color,
      amountColor: "green.4",
      icon: <CheckCircle2 size={18} />,
    };
  }

  if (status === "PENDING") {
    return {
      color,
      amountColor: "gray.3",
      icon: <Clock size={18} />,
    };
  }

  if (status === "ON_HOLD") {
    return {
      color,
      amountColor: "gray.3",
      icon: <PauseCircle size={18} />,
    };
  }

  if (status === "REJECTED") {
    return {
      color,
      amountColor: "gray.5",
      icon: <XCircle size={18} />,
    };
  }

  return {
    color,
    amountColor: "gray.5",
    icon: <Circle size={18} />,
  };
}

function EmptyTransactions() {
  return (
    <EmptyState
      variant="plain"
      icon={<Receipt size={26} />}
      color="gray"
      title="No transactions yet"
      description="Complete a PPT and your payout will show up here."
    />
  );
}

export default async function RecentTransactions({ userId }: Props) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    include: {
      payout: { select: PAYOUT_STATUS_SELECT },
      pptPayoutState: { select: { status: true, reason: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <FadeIn>
      <DashboardSectionHeader
        title="Recent Transactions"
        subtitle="Latest 10 payouts and pending entries"
        icon={<Receipt size={16} />}
        action={
          <LinkAnchor href="/dashboard/transactions" fz="sm" fw={500}>
            View all transactions &rarr;
          </LinkAnchor>
        }
      />
      <Card withBorder radius="md" p={0}>
        {rows.length === 0 ? (
          <EmptyTransactions />
        ) : (
          <Stack gap={0}>
            <StaggerContainer staggerChildren={0.04} delayChildren={0}>
              {rows.map((tx, i) => {
                const statusMeta = getStatusMeta(tx.status);
                const title = getTransactionTitle(tx);
                const currency = toCurrencyCode(tx.currency);
                const sourceMeta = getSourceMeta(tx.source);
                const explanation =
                  tx.status === "PAID" ? null : explainTransaction(tx);

                return (
                  <StaggerItem key={tx.id}>
                    <Group
                      gap="md"
                      wrap="nowrap"
                      p="md"
                      className={styles.row}
                      style={{
                        borderTop:
                          i > 0
                            ? "1px solid var(--mantine-color-default-border)"
                            : undefined,
                        transition:
                          "background-color var(--duration-fast) var(--ease-out)",
                      }}
                    >
                      <ThemeIcon
                        variant="light"
                        color={statusMeta.color}
                        size={40}
                        radius="md"
                      >
                        {statusMeta.icon}
                      </ThemeIcon>
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" wrap="nowrap">
                          {tx.linearIssueUrl ? (
                            <Anchor
                              href={tx.linearIssueUrl}
                              target="_blank"
                              fz="sm"
                              fw={600}
                              truncate="end"
                            >
                              {title}
                            </Anchor>
                          ) : (
                            <Text fz="sm" fw={600} truncate="end">
                              {title}
                            </Text>
                          )}
                          {tx.linearIssueIdentifier && (
                            <Badge size="xs" variant="default" color="gray">
                              {tx.linearIssueIdentifier}
                            </Badge>
                          )}
                        </Group>
                        <Group gap="xs">
                          {sourceMeta && (
                            <Badge
                              variant="light"
                              color={sourceMeta.color}
                              size="xs"
                            >
                              {sourceMeta.label}
                            </Badge>
                          )}
                          <StatusBadge
                            copy={statusCopy(TRANSACTION_STATUS, tx.status)}
                            size="xs"
                          />
                          <Text fz="xs" c="dimmed">
                            {tx.createdAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </Text>
                        </Group>
                        {explanation && (
                          <Text fz="xs" c="dimmed">
                            {explanation.headline}
                            {tx.status === "REJECTED" && explanation.detail
                              ? ` ${explanation.detail}`
                              : ""}
                          </Text>
                        )}
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Text fw={700} fz="sm" c={statusMeta.amountColor}>
                          {tx.status === "PAID" ? "+" : ""}
                          {formatAmount(tx.amount, currency)}
                        </Text>
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
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </Stack>
        )}
      </Card>
    </FadeIn>
  );
}
