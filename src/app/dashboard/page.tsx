import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { LinearClient } from "@linear/sdk";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
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
} from "@mantine/core";

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY || "dummy_key",
});

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const user = await currentUser();

  // Ensure user profile exists in db
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

  // Auto-derive Linear Account from Clerk's OAuth or Email
  if (!userProfile.linearId && user) {
    const linearOAuth = user.externalAccounts.find(
      (acc) => acc.provider === "oauth_linear",
    );

    // 1. If we have the OAuth connection, we can use the externalId (which is the Linear user ID) directly
    if (linearOAuth && linearOAuth.externalId) {
      userProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          linearId: linearOAuth.externalId,
          linearEmail: linearOAuth.emailAddress,
        },
        include: { transactions: true },
      });
    } else {
      // 2. Fallback to email matching via Linear API if no OAuth connection exists
      const primaryEmail = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId,
      )?.emailAddress;

      if (primaryEmail) {
        try {
          const usersResponse = await linearClient.users();
          const linearUser = usersResponse.nodes.find(
            (u) => u.email.toLowerCase() === primaryEmail.toLowerCase(),
          );

          if (linearUser) {
            userProfile = await prisma.userProfile.update({
              where: { id: userId },
              data: {
                linearId: linearUser.id,
                linearEmail: linearUser.email,
              },
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

  let assignedIssues: any[] = [];
  let linearError = null;
  let activeTasksPendingAmount = 0;

  if (userProfile.linearId) {
    try {
      const response = await linearClient.issues({
        first: 10,
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

      assignedIssues = issuesWithState
        .filter(
          ({ state }) =>
            state?.type !== "completed" && state?.type !== "canceled",
        )
        .map(({ issue }) => issue);

      activeTasksPendingAmount = assignedIssues.reduce((sum, issue) => {
        return sum + (issue.estimate ? issue.estimate * 10 : 0);
      }, 0);
    } catch (e) {
      const err = e as Error;
      linearError = err.message;
    }
  }

  const databasePendingBalance = userProfile.transactions
    .filter((tx) => tx.status === "PENDING")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalPendingBalance = databasePendingBalance + activeTasksPendingAmount;

  const totalEarned = userProfile.transactions
    .filter((tx) => tx.status === "PAID")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const rows = userProfile.transactions.map((tx) => (
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
          We couldn't automatically link your Linear account. Please ensure your
          Clerk account email (
          {user?.primaryEmailAddress?.emailAddress || "Not set"}) matches your
          Linear workspace email, or connect Linear via your profile settings.
        </Alert>
      )}

      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" mb="xl">
          {/* Wallet Cards */}
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
                ${totalPendingBalance.toFixed(2)}
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
                ${totalEarned.toFixed(2)}
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

      {userProfile.linearId && (
        <section style={{ marginTop: "3rem", marginBottom: "3rem" }}>
          <Title order={2} mb="md">
            Active Tasks
          </Title>
          {linearError ? (
            <Alert color="red">
              Could not load assigned tasks: {linearError}
            </Alert>
          ) : assignedIssues.length === 0 ? (
            <Card withBorder radius="md" padding="xl" ta="center">
              <Text c="dimmed">
                You have no active tasks. Head over to the PPT Board to claim
                some!
              </Text>
            </Card>
          ) : (
            <StaggerContainer>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {assignedIssues.map((issue) => {
                  const pptEstimate = issue.estimate ? issue.estimate * 10 : 0;
                  return (
                    <StaggerItem key={issue.id}>
                      <Card withBorder radius="md" padding="lg" h="100%">
                        <Group
                          justify="space-between"
                          align="flex-start"
                          mb="xs"
                        >
                          <Badge variant="light" color="blue">
                            {issue.identifier}
                          </Badge>
                          {pptEstimate > 0 && (
                            <Text fw={700} c="green" fz="sm">
                              ${pptEstimate} (Pending)
                            </Text>
                          )}
                        </Group>
                        <Text fw={600} lineClamp={1} mb="md">
                          {issue.title}
                        </Text>
                        <Group justify="space-between" mt="auto">
                          <Text fz="sm" c="dimmed">
                            {issue.estimate
                              ? `${issue.estimate} pts`
                              : "Unestimated"}
                          </Text>
                          <Anchor
                            href={issue.url}
                            target="_blank"
                            fz="sm"
                            fw={500}
                          >
                            Open in Linear &rarr;
                          </Anchor>
                        </Group>
                      </Card>
                    </StaggerItem>
                  );
                })}
              </SimpleGrid>
            </StaggerContainer>
          )}
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
