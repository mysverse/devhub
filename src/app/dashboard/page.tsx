import type { Issue } from "@linear/sdk";
import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  ProgressRoot,
  ProgressSection,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import type { Transaction, UserProfile } from "@prisma/client";
import { Carousel } from "motion-plus/react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AnimatedNumber,
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/animations";
import TaskCard from "@/components/TaskCard";
import { getSession } from "@/lib/auth-utils";
import { getLinearClient } from "@/lib/linear";
import prisma from "@/lib/prisma";

function WalletSkeletons() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" mb="xl">
      {[...Array(3)].map((_, i) => (
        <Card key={i} withBorder radius="md" padding="xl">
          <Skeleton height={12} width="40%" mb="sm" />
          <Skeleton height={32} width="60%" />
        </Card>
      ))}
    </SimpleGrid>
  );
}

function ActiveTasksSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {[...Array(2)].map((_, i) => (
        <Card key={i} withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="xs">
            <Skeleton height={20} width={60} />
            <Skeleton height={20} width={100} />
          </Group>
          <Skeleton height={24} mb="md" />
          <Group justify="space-between" mt="auto">
            <Skeleton height={16} width={80} />
            <Skeleton height={16} width={100} />
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}

function CarouselSkeleton() {
  return (
    <section style={{ marginBottom: "3rem" }}>
      <Skeleton height={32} width={200} mb="md" />
      <div style={{ display: "flex", gap: "20px", overflow: "hidden" }}>
        {[...Array(3)].map((_, i) => (
          <Card
            key={i}
            withBorder
            radius="md"
            padding="lg"
            style={{ width: 300, flexShrink: 0 }}
          >
            <Skeleton height={20} mb="xs" />
            <Skeleton height={24} mb="sm" />
            <Skeleton height={14} width="40%" />
          </Card>
        ))}
      </div>
    </section>
  );
}

async function UserWallet({
  userProfile,
  userId,
}: {
  userProfile: UserProfile & { transactions: Transaction[] };
  userId: string;
}) {
  let activeTasksPendingAmount = 0;

  if (userProfile.linearId) {
    try {
      const linearClient = await getLinearClient(userId);
      const response = await linearClient.issues({
        first: 50,
        filter: {
          assignee: { id: { eq: userProfile.linearId } },
        },
      });

      const allIssues = response.nodes;
      const issuesWithState = await Promise.all(
        allIssues.map(async (issue) => {
          const state = await issue.state;
          return { issue, state };
        }),
      );

      const assignedIssues = issuesWithState
        .filter(
          ({ state }) =>
            state?.type !== "completed" && state?.type !== "canceled",
        )
        .map(({ issue }) => issue);

      activeTasksPendingAmount = assignedIssues.reduce((sum, issue) => {
        return sum + (issue.estimate ? issue.estimate * 20 : 0);
      }, 0);
    } catch (_e) {
      console.error("Failed to fetch active tasks for wallet:", _e);
    }
  }

  const databasePendingBalance = userProfile.transactions
    .filter((tx) => tx.status === "PENDING")
    .reduce((sum: number, tx) => sum + tx.amount, 0);

  const totalPendingBalance = databasePendingBalance + activeTasksPendingAmount;

  const totalEarned = userProfile.transactions
    .filter((tx) => tx.status === "PAID")
    .reduce((sum: number, tx) => sum + tx.amount, 0);

  return (
    <FadeIn>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" mb="xl">
          <StaggerItem className="h-full">
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
              h="100%"
            >
              <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
                Pending PPTs
              </Text>
              <Text fz="xl" fw={700}>
                RM
                <AnimatedNumber
                  value={totalPendingBalance}
                  format={{
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                />
              </Text>
            </Card>
          </StaggerItem>

          <StaggerItem className="h-full">
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
              h="100%"
            >
              <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
                Total Earned
              </Text>
              <Text fz="xl" fw={700}>
                RM
                <AnimatedNumber
                  value={totalEarned}
                  format={{
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                />
              </Text>
            </Card>
          </StaggerItem>

          <StaggerItem className="h-full">
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
              h="100%"
            >
              <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
                Payment Method
              </Text>
              <Text fz="lg" fw={500}>
                {userProfile.paymentMethod}
              </Text>
              <Text fz="sm" c="dimmed" mt={5}>
                {userProfile.paymentMethod === "PAYPAL" &&
                  (userProfile.paypalEmail || "Not set")}
                {userProfile.paymentMethod === "ROBUX" &&
                  (userProfile.robuxUsername || "Not set")}
                {userProfile.paymentMethod === "BANK_TRANSFER" &&
                  (userProfile.bankAccountNumber
                    ? `${userProfile.bankName} - ${userProfile.bankAccountNumber}`
                    : "Not set")}
                {userProfile.paymentMethod === "DUITNOW" &&
                  (userProfile.duitNowId
                    ? `ID: ${userProfile.duitNowId}`
                    : userProfile.bankAccountNumber
                      ? `${userProfile.bankName} - ${userProfile.bankAccountNumber}`
                      : "Not set")}
              </Text>
            </Card>
          </StaggerItem>
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}

async function ActiveTasks({
  linearId,
  userId,
}: {
  linearId: string;
  userId: string;
}) {
  let assignedIssues: Issue[] = [];
  let linearError = null;

  try {
    const linearClient = await getLinearClient(userId);
    const response = await linearClient.issues({
      first: 10,
      filter: {
        assignee: { id: { eq: linearId } },
      },
    });

    const allIssues = response.nodes;
    const issuesWithState = await Promise.all(
      allIssues.map(async (issue) => {
        const state = await issue.state;
        return { issue, state };
      }),
    );

    assignedIssues = issuesWithState
      .filter(
        ({ state }) =>
          state?.type !== "completed" && state?.type !== "canceled",
      )
      .map(({ issue }) => issue);
  } catch (e) {
    const err = e as Error;
    linearError = err.message;
  }

  if (linearError) {
    return (
      <Alert color="red">Could not load assigned tasks: {linearError}</Alert>
    );
  }

  if (assignedIssues.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">
          You have no active tasks. Head over to the PPT Board to claim some!
        </Text>
      </Card>
    );
  }

  return (
    <FadeIn>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {assignedIssues.map((issue) => (
            <StaggerItem key={issue.id}>
              <TaskCard
                issueId={issue.id}
                identifier={issue.identifier}
                title={issue.title}
                url={issue.url}
                estimate={issue.estimate}
                variant="active"
              />
            </StaggerItem>
          ))}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}

function LeaderboardSkeleton() {
  return (
    <Card withBorder radius="md" p={0}>
      <Stack gap={0}>
        {[...Array(5)].map((_, i) => (
          <Group
            key={i}
            p="md"
            style={
              i > 0
                ? { borderTop: "1px solid var(--mantine-color-default-border)" }
                : undefined
            }
          >
            <Skeleton height={20} width={20} circle />
            <Skeleton height={16} width={120} />
            <Skeleton height={16} width={80} ml="auto" />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

type LeaderboardEntry = {
  name: string;
  avatarUrl: string | null;
  completedAmount: number;
  inProgressAmount: number;
  totalTasks: number;
  completedTasks: number;
};

async function Leaderboard({ userId }: { userId: string }) {
  try {
    const linearClient = await getLinearClient(userId);
    const response = await linearClient.issues({
      first: 100,
      filter: {
        labels: { name: { eq: "PPT" } },
        assignee: { null: false },
      },
    });

    const issues = response.nodes;

    // Enrich with assignee and state data
    const enriched = await Promise.all(
      issues.map(async (issue) => {
        const [assignee, state] = await Promise.all([
          issue.assignee,
          issue.state,
        ]);
        return { issue, assignee, stateType: state?.type ?? "unknown" };
      }),
    );

    // Group by assignee
    const byAssignee = new Map<string, LeaderboardEntry>();
    for (const { issue, assignee, stateType } of enriched) {
      if (!assignee) continue;
      const amount = issue.estimate ? issue.estimate * 20 : 0;
      const isCompleted = stateType === "completed";
      const isActive = stateType === "started" || stateType === "unstarted";

      const existing = byAssignee.get(assignee.id);
      if (existing) {
        existing.totalTasks++;
        if (isCompleted) {
          existing.completedAmount += amount;
          existing.completedTasks++;
        } else if (isActive) {
          existing.inProgressAmount += amount;
        }
      } else {
        byAssignee.set(assignee.id, {
          name: assignee.displayName || assignee.name,
          avatarUrl: assignee.avatarUrl ?? null,
          completedAmount: isCompleted ? amount : 0,
          inProgressAmount: isActive && !isCompleted ? amount : 0,
          totalTasks: 1,
          completedTasks: isCompleted ? 1 : 0,
        });
      }
    }

    const sorted = [...byAssignee.values()].sort(
      (a, b) =>
        b.completedAmount +
        b.inProgressAmount -
        (a.completedAmount + a.inProgressAmount),
    );

    if (sorted.length === 0) return null;

    const maxTotal = Math.max(
      ...sorted.map((e) => e.completedAmount + e.inProgressAmount),
    );

    return (
      <section style={{ marginBottom: "3rem" }}>
        <Title order={2} mb="md">
          Leaderboard
        </Title>
        <Card withBorder radius="md" p={0}>
          <Stack gap={0}>
            {sorted.map((entry, i) => {
              const total = entry.completedAmount + entry.inProgressAmount;
              const completedPct =
                maxTotal > 0 ? (entry.completedAmount / maxTotal) * 100 : 0;
              const inProgressPct =
                maxTotal > 0 ? (entry.inProgressAmount / maxTotal) * 100 : 0;

              return (
                <Group
                  key={entry.name}
                  p="md"
                  gap="md"
                  wrap="nowrap"
                  style={
                    i > 0
                      ? {
                          borderTop:
                            "1px solid var(--mantine-color-default-border)",
                        }
                      : undefined
                  }
                >
                  <Text fw={700} fz="sm" c="dimmed" w={20} ta="center">
                    {i + 1}
                  </Text>
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} fz="sm" truncate="end">
                        {entry.name}
                      </Text>
                      <Group gap="xs" wrap="nowrap">
                        {entry.inProgressAmount > 0 && (
                          <Text fz="xs" c="yellow" fw={600}>
                            +RM{entry.inProgressAmount} pending
                          </Text>
                        )}
                        <Text fw={700} fz="sm" c="green">
                          RM{total}
                        </Text>
                      </Group>
                    </Group>
                    <ProgressRoot size="sm">
                      <ProgressSection value={completedPct} color="green" />
                      <ProgressSection value={inProgressPct} color="yellow" />
                    </ProgressRoot>
                    <Text fz="xs" c="dimmed">
                      {entry.completedTasks}/{entry.totalTasks} tasks completed
                    </Text>
                  </Stack>
                </Group>
              );
            })}
          </Stack>
        </Card>
      </section>
    );
  } catch (e) {
    console.error("Failed to fetch leaderboard:", e);
    return null;
  }
}

async function SuggestedPPTs({ userId }: { userId: string }) {
  let issues: Issue[] = [];
  try {
    const linearClient = await getLinearClient(userId);
    const response = await linearClient.issues({
      first: 10,
      filter: {
        assignee: { null: true },
        state: { type: { eq: "unstarted" } },
        labels: { name: { eq: "PPT" } },
      },
    });
    // Sort by highest value first
    issues = response.nodes.sort(
      (a, b) => (b.estimate || 0) - (a.estimate || 0),
    );
  } catch (e) {
    console.error("Failed to fetch suggested PPTs:", e);
    return null;
  }

  if (issues.length === 0) return null;

  return (
    <section style={{ marginBottom: "3rem" }}>
      <Group justify="space-between" align="baseline" mb="md">
        <Title order={2}>Suggested for You</Title>
        <Anchor href="/dashboard/ppts" fz="sm" fw={500}>
          View all PPTs &rarr;
        </Anchor>
      </Group>
      <Text fz="sm" c="dimmed" mb="md">
        High-value tasks available to claim, sorted by payout.
      </Text>
      <Carousel
        gap={20}
        items={issues
          .slice(0, 6)
          .map((issue) => (
            <TaskCard
              key={issue.id}
              issueId={issue.id}
              identifier={issue.identifier}
              title={issue.title}
              url={issue.url}
              estimate={issue.estimate}
              description={issue.description}
              variant="compact"
            />
          ))}
      />
    </section>
  );
}

export default async function DashboardPage() {
  const { userId, user } = await getSession();
  if (!userId) redirect("/");

  let userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { transactions: true },
  });

  if (!userProfile) {
    userProfile = await prisma.userProfile.create({
      data: {
        id: userId,
        legalName: user?.name ?? null,
      },
      include: { transactions: true },
    });
  }

  // Auto-derive Linear Account from better-auth account table
  if (!userProfile.linearId) {
    const linearAccount = await prisma.account.findFirst({
      where: { userId, providerId: "linear" },
      select: { accountId: true },
    });
    if (linearAccount) {
      userProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          linearId: linearAccount.accountId,
          linearEmail: user?.email ?? null,
        },
        include: { transactions: true },
      });
    }
  }

  const transactions = userProfile.transactions;
  const rows = transactions.map((tx) => (
    <TableTr key={tx.id}>
      <TableTd>
        {tx.linearIssueId ? (
          tx.linearIssueUrl ? (
            <Anchor href={tx.linearIssueUrl} target="_blank" fz="sm" fw={500}>
              {tx.linearIssueTitle
                ? `${tx.linearIssueTitle} (${tx.linearIssueIdentifier || tx.linearIssueId})`
                : tx.linearIssueIdentifier || tx.linearIssueId}
            </Anchor>
          ) : (
            <Text fz="sm">
              {tx.linearIssueTitle
                ? `${tx.linearIssueTitle} (${tx.linearIssueIdentifier || tx.linearIssueId})`
                : tx.linearIssueIdentifier || tx.linearIssueId}
            </Text>
          )
        ) : (
          <Text fz="sm">Manual Bonus</Text>
        )}
      </TableTd>
      <TableTd fw={500}>
        {tx.currency === "MYR" ? "RM" : "$"}
        {tx.amount.toFixed(2)} {tx.currency}
      </TableTd>
      <TableTd>
        <Badge
          color={
            tx.status === "PAID"
              ? "green"
              : tx.status === "PENDING"
                ? "yellow"
                : "red"
          }
          variant="light"
        >
          {tx.status}
        </Badge>
      </TableTd>
      <TableTd c="dimmed" fz="sm">
        {new Date(tx.createdAt).toLocaleDateString()}
      </TableTd>
      <TableTd>
        <Anchor href={`/api/transactions/${tx.id}/pdf`} fz="sm" fw={500}>
          Slip
        </Anchor>
      </TableTd>
    </TableTr>
  ));

  return (
    <FadeIn>
      <div style={{ marginBottom: "2rem" }}>
        <Title order={1}>Overview</Title>
        <Text c="dimmed" mt="xs">
          Your earnings and recent PPT activity.
        </Text>
      </div>

      {!userProfile.linearId && (
        <Alert color="yellow" title="Linear Account Not Linked" mb="xl">
          We couldn&apos;t automatically link your Linear account. Please ensure
          your account email ({user?.email || "Not set"}) matches your Linear
          workspace email, or try signing out and back in.
        </Alert>
      )}

      <Suspense fallback={<WalletSkeletons />}>
        <UserWallet userProfile={userProfile} userId={userId} />
      </Suspense>

      <Suspense fallback={<CarouselSkeleton />}>
        <SuggestedPPTs userId={userId} />
      </Suspense>

      <Suspense fallback={<LeaderboardSkeleton />}>
        <Leaderboard userId={userId} />
      </Suspense>

      {userProfile.linearId && (
        <section style={{ marginTop: "3rem", marginBottom: "3rem" }}>
          <Title order={2} mb="md">
            Active Tasks
          </Title>
          <Suspense fallback={<ActiveTasksSkeleton />}>
            <ActiveTasks linearId={userProfile.linearId} userId={userId} />
          </Suspense>
        </section>
      )}

      <section style={{ marginTop: "3rem" }}>
        <Title order={2} mb="md">
          Recent Transactions
        </Title>
        <Card withBorder radius="md" p={0}>
          <div style={{ overflowX: "auto" }}>
            <Table
              striped
              highlightOnHover
              verticalSpacing="md"
              style={{ minWidth: 500 }}
            >
              <TableThead>
                <TableTr>
                  <TableTh>Task</TableTh>
                  <TableTh>Amount</TableTh>
                  <TableTh>Status</TableTh>
                  <TableTh>Date</TableTh>
                  <TableTh />
                </TableTr>
              </TableThead>
              <TableTbody>
                {rows.length > 0 ? (
                  rows
                ) : (
                  <TableTr>
                    <TableTd colSpan={5}>
                      <Text ta="center" c="dimmed" py="xl">
                        No transactions yet. Complete some PPTs!
                      </Text>
                    </TableTd>
                  </TableTr>
                )}
              </TableTbody>
            </Table>
          </div>
        </Card>
      </section>
    </FadeIn>
  );
}
