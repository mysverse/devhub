"use client";

import {
  Card,
  SimpleGrid,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
} from "@mantine/core";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import PayoutCard from "./PayoutCard";
import type { PayoutTransaction } from "./types";

function TransactionGrid({
  transactions,
  emptyMessage,
}: {
  transactions: PayoutTransaction[];
  emptyMessage: string;
}) {
  if (transactions.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">{emptyMessage}</Text>
      </Card>
    );
  }

  return (
    <StaggerContainer>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {transactions.map((tx) => (
          <StaggerItem key={tx.id}>
            <PayoutCard transaction={tx} />
          </StaggerItem>
        ))}
      </SimpleGrid>
    </StaggerContainer>
  );
}

export default function AdminPayoutTabs({
  pending,
  paid,
  rejected,
}: {
  pending: PayoutTransaction[];
  paid: PayoutTransaction[];
  rejected: PayoutTransaction[];
}) {
  return (
    <Tabs defaultValue="pending">
      <TabsList mb="lg">
        <TabsTab value="pending">Pending ({pending.length})</TabsTab>
        <TabsTab value="paid">Paid ({paid.length})</TabsTab>
        <TabsTab value="rejected">Rejected ({rejected.length})</TabsTab>
      </TabsList>

      <TabsPanel value="pending">
        <TransactionGrid
          transactions={pending}
          emptyMessage="No pending payouts right now! The team is all caught up."
        />
      </TabsPanel>

      <TabsPanel value="paid">
        <TransactionGrid
          transactions={paid}
          emptyMessage="No processed payouts yet."
        />
      </TabsPanel>

      <TabsPanel value="rejected">
        <TransactionGrid
          transactions={rejected}
          emptyMessage="No rejected payouts."
        />
      </TabsPanel>
    </Tabs>
  );
}
