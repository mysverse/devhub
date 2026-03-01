import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PayoutCard from "./PayoutCard";
import { LinearClient } from "@linear/sdk";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import { Title, Text, SimpleGrid, Card } from "@mantine/core";
import { Transaction, UserProfile } from "@prisma/client";

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY || 'dummy_key',
});

type TransactionWithUser = Transaction & { user: UserProfile };

export default async function AdminPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/");
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (!userProfile || userProfile.role !== 'ADMIN') {
    redirect("/dashboard");
  }

  const pendingTransactions = await prisma.transaction.findMany({
    where: { status: 'PENDING' },
    include: { user: true },
    orderBy: { createdAt: 'asc' }
  });

  // Fetch issue details from Linear to show task titles
  const transactionsWithDetails = await Promise.all(
    pendingTransactions.map(async (tx: TransactionWithUser) => {
      let taskTitle = tx.linearIssueId || "Manual Payout";
      
      if (tx.linearIssueId && !tx.linearIssueId.includes(' ')) {
        try {
          const issue = await linearClient.issue(tx.linearIssueId);
          taskTitle = `${issue.identifier} - ${issue.title}`;
        } catch {
          console.error("Failed to fetch issue details for", tx.linearIssueId);
        }
      }

      // Generate payment details snippet based on user preferences
      let paymentDetails = null;
      const { user } = tx;

      if (user.paymentMethod === 'PAYPAL') {
        paymentDetails = <>{user.paypalEmail || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing Email</span>}</>;
      } else if (user.paymentMethod === 'ROBUX') {
        paymentDetails = <>{user.robuxUsername || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing Username</span>}</>;
      } else if (user.paymentMethod === 'BANK_TRANSFER') {
        paymentDetails = (
          <>
            <div>Bank: {user.bankName || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
            <div>Acct: {user.bankAccountNumber || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
            <div>Name: {user.bankAccountName || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
          </>
        );
      } else if (user.paymentMethod === 'DUITNOW') {
        if (user.duitNowId) {
          paymentDetails = <>ID: {user.duitNowId}</>;
        } else {
          paymentDetails = (
            <>
              <div>Bank: {user.bankName || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
              <div>Acct: {user.bankAccountNumber || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
              <div>Name: {user.bankAccountName || <span style={{ color: 'var(--mantine-color-red-6)' }}>Missing</span>}</div>
            </>
          );
        }
      }

      return {
        ...tx,
        taskTitle,
        paymentDetails
      };
    })
  );

  return (
    <FadeIn>
      <div style={{ marginBottom: '2rem' }}>
        <Title order={1}>Admin Payouts</Title>
        <Text c="dimmed" mt="xs">
          Review pending PPTs and manually fulfill developer payouts.
        </Text>
      </div>

      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {transactionsWithDetails.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <Card withBorder radius="md" padding="xl" ta="center">
                <Text c="dimmed">No pending payouts right now! The team is all caught up.</Text>
              </Card>
            </div>
          ) : (
            transactionsWithDetails.map((tx) => (
              <StaggerItem key={tx.id}>
                <PayoutCard
                  transactionId={tx.id}
                  amount={tx.amount}
                  currency={tx.currency}
                  developerName={tx.user.legalName || tx.user.linearEmail || "Unknown Developer"}
                  taskTitle={tx.taskTitle}
                  paymentMethod={tx.user.paymentMethod}
                  paymentDetails={tx.paymentDetails}
                />
              </StaggerItem>
            ))
          )}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}