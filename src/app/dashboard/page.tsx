import type { Transaction, UserProfile } from "@prisma/client";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Issue } from "@linear/sdk";
import { getLinearClient } from "@/lib/linear";
import { FadeIn, StaggerContainer, StaggerItem, AnimatedNumber } from "@/components/animations";
import {
  Title,
  Text,
  SimpleGrid,
  Card,
  Badge,
  Table,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
  Alert,
  Group,
  Anchor,
  Skeleton,
} from "@mantine/core";
import { Suspense } from "react";
import { Carousel } from "motion-plus/react";

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
        return sum + (issue.estimate ? issue.estimate * 5 : 0);
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
          <StaggerItem>
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
            >
              <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
                Pending PPTs
              </Text>
              <Text fz="xl" fw={700}>
                $
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

          <StaggerItem>
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
            >
              <Text fz="sm" tt="uppercase" fw={700} c="dimmed">
                Total Earned
              </Text>
              <Text fz="xl" fw={700}>
                $
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

          <StaggerItem>
            <Card
              withBorder
              radius="md"
              padding="xl"
              bg="var(--mantine-color-body)"
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
          {assignedIssues.map((issue) => {
            const pptEstimate = issue.estimate ? issue.estimate * 5 : 0;
            return (
              <StaggerItem key={issue.id}>
                <Card withBorder radius="md" padding="lg" h="100%">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Badge variant="light" color="blue">
                      {issue.identifier}
                    </Badge>
                    {pptEstimate > 0 && (
                      <Text fw={700} c="green" fz="sm">
                        $
                        <AnimatedNumber
                          value={pptEstimate}
                          format={{
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }}
                        />{" "}
                        (Pending)
                      </Text>
                    )}
                  </Group>
                  <Text fw={600} lineClamp={1} mb="md">
                    {issue.title}
                  </Text>
                  <Group justify="space-between" mt="auto">
                    <Text fz="sm" c="dimmed">
                      {issue.estimate ? `${issue.estimate} pts` : "Unestimated"}
                    </Text>
                    <Anchor href={issue.url} target="_blank" fz="sm" fw={500}>
                      Open in Linear &rarr;
                    </Anchor>
                  </Group>
                </Card>
              </StaggerItem>
            );
          })}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}

async function RecommendedPPTs({ userId }: { userId: string }) {
  let issues: Issue[] = [];
  try {
    const linearClient = await getLinearClient(userId);
    const response = await linearClient.issues({
      first: 5,
      filter: {
        assignee: { null: true },
        state: { type: { eq: "unstarted" } },
      },
    });
    issues = response.nodes.sort(
      (a, b) => (b.estimate || 0) - (a.estimate || 0),
    );
  } catch (e) {
    console.error("Failed to fetch recommended PPTs:", e);
    return null;
  }

  if (issues.length === 0) return null;

  return (
    <section style={{ marginBottom: "3rem" }}>
      <Title order={2} mb="md">
        Available PPTs
      </Title>
      <Carousel
        gap={20}
        items={issues.map((issue) => {
          const pptEstimate = issue.estimate ? issue.estimate * 5 : 0;
          return (
            <Card
              key={issue.id}
              withBorder
              radius="md"
              padding="lg"
              style={{ width: 300 }}
            >
              <Group justify="space-between" mb="xs">
                <Badge size="sm" variant="light">
                  {issue.identifier}
                </Badge>
                <Text fw={700} c="green">
                  {pptEstimate > 0 ? `$${pptEstimate}` : "$5 - $25"}
                </Text>
              </Group>
              <Text fw={600} lineClamp={1} mb="sm">
                {issue.title}
              </Text>
              <Anchor href={issue.url} target="_blank" fz="sm" fw={500}>
                View Task &rarr;
              </Anchor>
            </Card>
          );
        })}
      />
    </section>
  );
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();

  let userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: { transactions: true },
  });

  if (!userProfile) {
    userProfile = await prisma.userProfile.create({
      data: {
        id: userId,
        legalName: user?.firstName
          ? `${user.firstName} ${user.lastName || ""}`.trim()
          : null,
      },
      include: { transactions: true },
    });
  }

  // Auto-derive Linear Account
  if (!userProfile.linearId && user) {
    const linearOAuth = user.externalAccounts.find(
      (acc) => acc.provider === "linear",
    );
    if (linearOAuth && linearOAuth.providerUserId) {
      userProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          linearId: linearOAuth.providerUserId,
          linearEmail: linearOAuth.emailAddress,
        },
        include: { transactions: true },
      });
    } else {
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId,
      )?.emailAddress;
      if (primaryEmail) {
        try {
          const linearClient = await getLinearClient(userId);
          const usersResponse = await linearClient.users();
          const linearUser = usersResponse.nodes.find(
            (u) => u.email.toLowerCase() === primaryEmail.toLowerCase(),
          );
          if (linearUser) {
            userProfile = await prisma.userProfile.update({
              where: { id: userId },
              data: { linearId: linearUser.id, linearEmail: linearUser.email },
              include: { transactions: true },
            });
          }
        } catch (e) {
          console.error(
            "Failed to automatically link Linear account via email:",
            e,
          );
        }
      }
    }
  }

  const transactions = userProfile.transactions;
  const rows = transactions.map((tx) => (
    <TableTr key={tx.id}>
      <TableTd>{tx.linearIssueId || "Manual Bonus"}</TableTd>
      <TableTd fw={500}>
        ${tx.amount.toFixed(2)} {tx.currency}
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
          your Clerk account email (
          {user?.primaryEmailAddress?.emailAddress || "Not set"}) matches your
          Linear workspace email, or connect Linear via your profile settings.
        </Alert>
      )}

      <Suspense fallback={<WalletSkeletons />}>
        <UserWallet userProfile={userProfile} userId={userId} />
      </Suspense>

      <Suspense fallback={<CarouselSkeleton />}>
        <RecommendedPPTs userId={userId} />
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
                  <TableTh>Task (Linear ID)</TableTh>
                  <TableTh>Amount</TableTh>
                  <TableTh>Status</TableTh>
                  <TableTh>Date</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {rows.length > 0 ? (
                  rows
                ) : (
                  <TableTr>
                    <TableTd colSpan={4}>
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
