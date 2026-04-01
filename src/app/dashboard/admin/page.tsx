import { Group, Text, Title } from "@mantine/core";
import type { Payout, Transaction, UserProfile } from "@prisma/client";
import { redirect } from "next/navigation";
import { FadeIn } from "@/components/animations";
import LinkButton from "@/components/LinkButton";
import { getSession } from "@/lib/auth-utils";
import { getUserWeeklyUsage } from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import { getLinearClient, LinearReauthRequiredError } from "@/lib/linear";
import prisma from "@/lib/prisma";
import AdminPayoutTabs from "./AdminPayoutTabs";
import type { PayoutTransaction } from "./types";

type TransactionWithUser = Transaction & {
  user: UserProfile;
  payout: Payout | null;
};

function buildPayoutTransaction(
  tx: TransactionWithUser,
  taskTitle: string,
  creditLimitUsage?: { used: number; limit: number; remaining: number } | null,
): PayoutTransaction {
  const { user } = tx;
  return {
    id: tx.id,
    userId: user.id,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    taskTitle,
    developerName: user.legalName || user.linearEmail || "Unknown Developer",
    paymentMethod: user.paymentMethod,
    paypalEmail: user.paypalEmail,
    duitNowId: user.duitNowId,
    bankName: user.bankName,
    bankAccountNumber: user.bankAccountNumber,
    bankAccountName: user.bankAccountName,
    robuxUsername: user.robuxUsername,
    linearIssueIdentifier: tx.linearIssueIdentifier,
    linearIssueUrl: tx.linearIssueUrl,
    email: user.linearEmail,
    paidAt: tx.paidAt?.toISOString() ?? null,
    rejectedAt: tx.rejectedAt?.toISOString() ?? null,
    rejectionReason: tx.rejectionReason,
    autoApproved: tx.autoApproved,
    payout: tx.payout
      ? {
          id: tx.payout.id,
          provider: tx.payout.provider,
          status: tx.payout.status,
          errorMessage: tx.payout.errorMessage,
        }
      : null,
    creditLimitUsage: creditLimitUsage ?? null,
  };
}

export default async function AdminPage() {
  const { userId } = await getSession();

  if (!userId) {
    redirect("/");
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userProfile || userProfile.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [pendingTransactions, paidTransactions, rejectedTransactions] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { status: "PENDING" },
        include: { user: true, payout: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.transaction.findMany({
        where: { status: "PAID" },
        include: { user: true, payout: true },
        orderBy: { paidAt: "desc" },
        take: 50,
      }),
      prisma.transaction.findMany({
        where: { status: "REJECTED" },
        include: { user: true, payout: true },
        orderBy: { rejectedAt: "desc" },
        take: 50,
      }),
    ]);

  let linearClient: Awaited<ReturnType<typeof getLinearClient>>;
  try {
    linearClient = await getLinearClient(userId);
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      redirect("/auth/reauth-linear?returnTo=/dashboard/admin");
    }
    throw e;
  }

  // Compute credit limit usage per unique userId+currency for pending transactions
  const creditUsageMap = new Map<
    string,
    { used: number; limit: number; remaining: number }
  >();
  const uniqueUserCurrencies = new Set(
    pendingTransactions.map((tx) => `${tx.userId}:${tx.currency}`),
  );
  await Promise.all(
    [...uniqueUserCurrencies].map(async (key) => {
      const [uid, curr] = key.split(":");
      try {
        const usage = await getUserWeeklyUsage(uid, curr as CurrencyCode);
        creditUsageMap.set(key, usage);
      } catch {
        // Credit limit data is non-critical
      }
    }),
  );

  // Enrich pending transactions with Linear issue details
  const pending: PayoutTransaction[] = await Promise.all(
    pendingTransactions.map(async (tx: TransactionWithUser) => {
      let taskTitle =
        tx.linearIssueTitle || tx.linearIssueId || "Manual Payout";

      if (
        tx.linearIssueId &&
        !tx.linearIssueId.includes(" ") &&
        !tx.linearIssueTitle
      ) {
        try {
          const issue = await linearClient.issue(tx.linearIssueId);
          taskTitle = `${issue.identifier} - ${issue.title}`;
        } catch {
          console.error("Failed to fetch issue details for", tx.linearIssueId);
        }
      }

      const creditUsage = creditUsageMap.get(`${tx.userId}:${tx.currency}`);
      return buildPayoutTransaction(tx, taskTitle, creditUsage);
    }),
  );

  // For paid/rejected, use stored titles (no Linear API calls)
  const paid: PayoutTransaction[] = paidTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(
        tx,
        tx.linearIssueTitle
          ? `${tx.linearIssueIdentifier} - ${tx.linearIssueTitle}`
          : tx.linearIssueIdentifier || "Manual Payout",
      ),
  );

  const rejected: PayoutTransaction[] = rejectedTransactions.map(
    (tx: TransactionWithUser) =>
      buildPayoutTransaction(
        tx,
        tx.linearIssueTitle
          ? `${tx.linearIssueIdentifier} - ${tx.linearIssueTitle}`
          : tx.linearIssueIdentifier || "Manual Payout",
      ),
  );

  return (
    <FadeIn>
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Admin Payouts</Title>
          <Text c="dimmed" mt="xs">
            Review and manage developer payouts.
          </Text>
        </div>
        <Group>
          <LinkButton href="/dashboard/admin/users" variant="light">
            Team Members
          </LinkButton>
          <LinkButton href="/dashboard/admin/documents" variant="light">
            Document Compliance
          </LinkButton>
        </Group>
      </Group>

      <AdminPayoutTabs pending={pending} paid={paid} rejected={rejected} />
    </FadeIn>
  );
}
