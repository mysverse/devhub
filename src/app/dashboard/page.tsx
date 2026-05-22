import type { Issue } from "@linear/sdk";
import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  List,
  ListItem,
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
import LinkAnchor from "@/components/LinkAnchor";
import TaskCard from "@/components/TaskCard";
import { getSession } from "@/lib/auth-utils";
import { formatBonusPeriod } from "@/lib/bonus";
import {
  getUserWeeklyUsage,
  getWeekBounds,
  WEEKLY_CREDIT_LIMITS,
} from "@/lib/credit-limit";
import type { CurrencyCode } from "@/lib/currency";
import {
  estimateToAmount,
  formatAmount,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
import {
  getBankDisplayName,
  getPaymentMethodLabel,
} from "@/lib/payment-validation";
import prisma from "@/lib/prisma";

function WalletSkeletons() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" mb="xl">
      {[...Array(6)].map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
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
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
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
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
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
  currency,
}: {
  userProfile: UserProfile & { transactions: Transaction[] };
  userId: string;
  currency: CurrencyCode;
}) {
  let activePptPendingAmount = 0;

  if (userProfile.linearId) {
    try {
      const linearId = userProfile.linearId;
      activePptPendingAmount = await withLinearFallback(
        userId,
        async (client) => {
          const response = await client.issues({
            first: 50,
            filter: {
              assignee: { id: { eq: linearId } },
            },
          });

          const allIssues = response.nodes;
          const issuesWithState = await Promise.all(
            allIssues.map(async (issue) => {
              const [state, labels] = await Promise.all([
                issue.state,
                issue.labels(),
              ]);
              return {
                issue,
                state,
                hasPptLabel: labels.nodes.some(
                  (label) => label.name.toUpperCase() === "PPT",
                ),
              };
            }),
          );

          return issuesWithState
            .filter(
              ({ state, hasPptLabel }) =>
                hasPptLabel &&
                state?.type !== "completed" &&
                state?.type !== "canceled",
            )
            .reduce((sum, { issue }) => {
              return (
                sum +
                (issue.estimate
                  ? estimateToAmount(issue.estimate, currency)
                  : 0)
              );
            }, 0);
        },
      );
    } catch (e) {
      if (e instanceof LinearReauthRequiredError) {
        redirect("/auth/reauth-linear?returnTo=/dashboard");
      }
      console.error("Failed to fetch active tasks for wallet:", e);
    }
  }

  const databasePendingBalance = userProfile.transactions
    .filter(
      (tx) =>
        tx.status === "PENDING" &&
        tx.source === "PPT" &&
        tx.currency === currency,
    )
    .reduce((sum: number, tx) => sum + tx.amount, 0);

  const totalPendingBalance = databasePendingBalance + activePptPendingAmount;

  const [potentialBonusBalance, approvedBonusBalance] = await Promise.all([
    prisma.bonusCandidate.aggregate({
      where: {
        userId,
        currency,
        status: { in: ["ELIGIBLE", "READY_FOR_REVIEW"] },
      },
      _sum: { maxAmount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        currency,
        source: "BONUS",
        status: "PENDING",
      },
      _sum: { amount: true },
    }),
  ]);

  const totalEarned = userProfile.transactions
    .filter((tx) => tx.status === "PAID" && tx.currency === currency)
    .reduce((sum: number, tx) => sum + tx.amount, 0);

  const creditUsage = await getUserWeeklyUsage(userId, currency);
  const { weekEnd } = getWeekBounds();
  const usagePct =
    creditUsage.limit > 0 ? (creditUsage.used / creditUsage.limit) * 100 : 0;
  const progressColor =
    usagePct >= 100 ? "red" : usagePct >= 70 ? "yellow" : "green";

  return (
    <FadeIn>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg" mb="xl">
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
                {currency === "MYR" ? "RM" : ""}
                <AnimatedNumber
                  value={totalPendingBalance}
                  format={{
                    minimumFractionDigits: currency === "MYR" ? 2 : 0,
                    maximumFractionDigits: currency === "MYR" ? 2 : 0,
                  }}
                />
                {currency === "ROBUX" ? " Robux" : ""}
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
                Potential Bonuses
              </Text>
              <Text fz="xl" fw={700}>
                {formatAmount(
                  potentialBonusBalance._sum.maxAmount ?? 0,
                  currency,
                )}
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
                Approved Bonuses
              </Text>
              <Text fz="xl" fw={700}>
                {formatAmount(approvedBonusBalance._sum.amount ?? 0, currency)}
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
                {currency === "MYR" ? "RM" : ""}
                <AnimatedNumber
                  value={totalEarned}
                  format={{
                    minimumFractionDigits: currency === "MYR" ? 2 : 0,
                    maximumFractionDigits: currency === "MYR" ? 2 : 0,
                  }}
                />
                {currency === "ROBUX" ? " Robux" : ""}
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
                {getPaymentMethodLabel(userProfile.paymentMethod)}
              </Text>
              <Text fz="sm" c="dimmed" mt={5}>
                {userProfile.paymentMethod === "PAYPAL" &&
                  (userProfile.paypalEmail || "Not set")}
                {userProfile.paymentMethod === "ROBUX" &&
                  (userProfile.robuxUsername || "Not set")}
                {userProfile.paymentMethod === "BANK_TRANSFER" &&
                  (userProfile.bankAccountNumber
                    ? `${getBankDisplayName(userProfile.bankName)} - ${userProfile.bankAccountNumber}`
                    : "Not set")}
                {userProfile.paymentMethod === "DUITNOW" &&
                  (userProfile.duitNowId
                    ? `ID: ${userProfile.duitNowId}`
                    : userProfile.bankAccountNumber
                      ? `${getBankDisplayName(userProfile.bankName)} - ${userProfile.bankAccountNumber}`
                      : "Not set")}
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
                Weekly Credit
              </Text>
              <Text fz="xl" fw={700}>
                {formatAmount(creditUsage.used, currency)} /{" "}
                {formatAmount(creditUsage.limit, currency)}
              </Text>
              <ProgressRoot size="sm" mt="sm">
                <ProgressSection
                  value={Math.min(usagePct, 100)}
                  color={progressColor}
                />
              </ProgressRoot>
              <Text fz="xs" c="dimmed" mt="xs">
                Resets{" "}
                {weekEnd.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}{" "}
                23:59 UTC
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
  currency,
}: {
  linearId: string;
  userId: string;
  currency: CurrencyCode;
}) {
  let assignedIssues: { issue: Issue; labelNames: string[] }[] = [];
  let linearError = null;

  try {
    assignedIssues = await withLinearFallback(userId, async (client) => {
      const response = await client.issues({
        first: 10,
        filter: {
          assignee: { id: { eq: linearId } },
        },
      });

      const allIssues = response.nodes;
      const issuesWithState = await Promise.all(
        allIssues.map(async (issue) => {
          const [state, labels] = await Promise.all([
            issue.state,
            issue.labels(),
          ]);
          return {
            issue,
            state,
            labelNames: labels.nodes.map((label) => label.name),
          };
        }),
      );

      return issuesWithState
        .filter(
          ({ state }) =>
            state?.type !== "completed" && state?.type !== "canceled",
        )
        .map(({ issue, labelNames }) => ({ issue, labelNames }));
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      redirect("/auth/reauth-linear?returnTo=/dashboard");
    }
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

  const bonusCandidates = await prisma.bonusCandidate.findMany({
    where: {
      userId,
      linearIssueId: {
        in: assignedIssues.map(({ issue }) => issue.id),
      },
      status: { in: ["ELIGIBLE", "READY_FOR_REVIEW"] },
    },
    select: {
      linearIssueId: true,
      maxAmount: true,
      currency: true,
    },
  });
  const bonusByIssueId = new Map(
    bonusCandidates.map((candidate) => [candidate.linearIssueId, candidate]),
  );
  const pptStates = await prisma.pptPayoutState.findMany({
    where: {
      linearIssueId: {
        in: assignedIssues.map(({ issue }) => issue.id),
      },
    },
    select: {
      linearIssueId: true,
      status: true,
      reason: true,
    },
  });
  const pptStateByIssueId = new Map(
    pptStates.map((state) => [state.linearIssueId, state]),
  );

  return (
    <FadeIn>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {assignedIssues.map(({ issue, labelNames }) => {
            const hasPptLabel = labelNames.some(
              (label) => label.toUpperCase() === "PPT",
            );
            const bonus = bonusByIssueId.get(issue.id);
            const pptState = pptStateByIssueId.get(issue.id);
            const bonusCurrency = bonus?.currency === "ROBUX" ? "ROBUX" : "MYR";
            const earningsText = hasPptLabel
              ? issue.estimate
                ? `${formatAmount(estimateToAmount(issue.estimate, currency), currency)} (Pending)`
                : null
              : bonus
                ? `Up to ${formatAmount(bonus.maxAmount, bonusCurrency)}`
                : null;

            return (
              <StaggerItem key={issue.id}>
                <TaskCard
                  issueId={issue.id}
                  identifier={issue.identifier}
                  title={issue.title}
                  url={issue.url}
                  estimate={issue.estimate}
                  variant="active"
                  currency={currency}
                  earningsText={earningsText}
                  isPpt={hasPptLabel}
                  proofStatus={pptState?.status ?? null}
                  proofReason={pptState?.reason?.replaceAll("_", " ") ?? null}
                />
              </StaggerItem>
            );
          })}
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
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
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
    const { enriched: enrichedData } = await withLinearFallback(
      userId,
      async (client) => {
        const response = await client.issues({
          first: 100,
          filter: {
            labels: { name: { eq: "PPT" } },
            assignee: { null: false },
          },
        });

        const nodes = response.nodes;

        const enriched = await Promise.all(
          nodes.map(async (issue) => {
            const [assignee, state] = await Promise.all([
              issue.assignee,
              issue.state,
            ]);
            return { issue, assignee, stateType: state?.type ?? "unknown" };
          }),
        );

        return { enriched };
      },
    );

    const enriched = enrichedData;

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
    if (e instanceof LinearReauthRequiredError) {
      redirect("/auth/reauth-linear?returnTo=/dashboard");
    }
    console.error("Failed to fetch leaderboard:", e);
    return null;
  }
}

function HowPPTsWork({ currency }: { currency: CurrencyCode }) {
  const multiplier = currency === "MYR" ? 20 : 1200;
  const limit = WEEKLY_CREDIT_LIMITS[currency];
  const points = [1, 2, 3, 4, 5];

  return (
    <FadeIn>
      <section style={{ marginBottom: "3rem" }}>
        <Title order={2} mb="md">
          How PPTs Work
        </Title>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
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
                <ListItem>
                  Issue has a complexity estimate (1-5 points)
                </ListItem>
                <ListItem>Issue is marked as completed</ListItem>
                <ListItem>Issue is assigned to you</ListItem>
                <ListItem>
                  You post a recent <strong>#ppt-proof</strong> comment with
                  what changed, proof links/screenshots, location, and
                  verification notes
                </ListItem>
                <ListItem>
                  The issue stays completed through the payout stability window
                </ListItem>
              </List>
              <Text fz="sm" fw={600} mt="xs">
                Payout per point
              </Text>
              <Group gap="xs" wrap="wrap">
                {points.map((pt) => (
                  <Badge key={pt} variant="light" color="blue" size="lg">
                    {pt}pt = {formatAmount(pt * multiplier, currency)}
                  </Badge>
                ))}
              </Group>
              <Text fz="xs" c="dimmed" mt="xs">
                <strong>Pending PPTs</strong> = pending transactions + estimated
                value of your active tasks. <strong>Total Earned</strong> = sum
                of all paid transactions.
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Text fz="sm" tt="uppercase" fw={700} c="dimmed" mb="sm">
              Automated Payouts
            </Text>
            <Stack gap="sm">
              <Text fz="sm">
                Payouts within the weekly credit limit are auto-approved and
                paid after proof and the stability window pass. Payouts that
                exceed the limit stay pending for manual admin review.
              </Text>
              <List size="sm" spacing="xs">
                <ListItem>
                  Weekly limit: <strong>{formatAmount(limit, currency)}</strong>
                </ListItem>
                <ListItem>Week runs Monday to Sunday (UTC)</ListItem>
                <ListItem>
                  Pending and paid PPT transactions count toward the limit
                </ListItem>
                <ListItem>
                  If a task moves from Done back to In Progress, unpaid payouts
                  are held until it is completed again with fresh proof
                </ListItem>
              </List>
              <Text fz="xs" c="dimmed" mt="xs">
                The <strong>Weekly Credit</strong> card above shows how much of
                your limit has been used this week. Once the limit is reached,
                any new payouts will require admin approval.
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>
      </section>
    </FadeIn>
  );
}

async function SuggestedPPTs({
  userId,
  currency,
}: {
  userId: string;
  currency: CurrencyCode;
}) {
  let issues: Issue[] = [];
  try {
    issues = await withLinearFallback(userId, async (client) => {
      const response = await client.issues({
        first: 10,
        filter: {
          assignee: { null: true },
          state: { type: { eq: "unstarted" } },
          labels: { name: { eq: "PPT" } },
        },
      });
      // Sort by highest value first
      return response.nodes.sort(
        (a, b) => (b.estimate || 0) - (a.estimate || 0),
      );
    });
  } catch (e) {
    if (e instanceof LinearReauthRequiredError) {
      redirect("/auth/reauth-linear?returnTo=/dashboard");
    }
    console.error("Failed to fetch suggested PPTs:", e);
    return null;
  }

  if (issues.length === 0) return null;

  return (
    <section style={{ marginBottom: "3rem" }}>
      <Group justify="space-between" align="baseline" mb="md">
        <Title order={2}>Suggested for You</Title>
        <LinkAnchor href="/dashboard/ppts" fz="sm" fw={500}>
          View all PPTs &rarr;
        </LinkAnchor>
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
              currency={currency}
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

  const userCurrency = getCurrencyForPaymentMethod(userProfile.paymentMethod);
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
        ) : tx.source === "BONUS" ? (
          <Text fz="sm">
            {tx.linearIssueTitle ||
              `${formatBonusPeriod(tx.bonusPeriod)} Bonus`}
          </Text>
        ) : (
          <Text fz="sm">Manual Payout</Text>
        )}
      </TableTd>
      <TableTd fw={500}>
        {formatAmount(tx.amount, tx.currency as CurrencyCode)}
      </TableTd>
      <TableTd>
        <Badge
          color={
            tx.status === "PAID"
              ? "green"
              : tx.status === "PENDING"
                ? "yellow"
                : tx.status === "ON_HOLD"
                  ? "orange"
                  : tx.status === "REJECTED"
                    ? "red"
                    : "gray"
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
          Your earnings and recent activity.
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
        <UserWallet
          userProfile={userProfile}
          userId={userId}
          currency={userCurrency}
        />
      </Suspense>

      <HowPPTsWork currency={userCurrency} />

      <Suspense fallback={<CarouselSkeleton />}>
        <SuggestedPPTs userId={userId} currency={userCurrency} />
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
            <ActiveTasks
              linearId={userProfile.linearId}
              userId={userId}
              currency={userCurrency}
            />
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
