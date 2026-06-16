"use client";

import { SimpleGrid, Tabs, TabsList, TabsPanel, TabsTab } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import AdminBonusesTab, {
  type BonusConfigData,
  type BonusReviewCandidate,
} from "./AdminBonusesTab";
import AdminIncentivesTab, {
  type AdminIncentiveAwardData,
  type IncentiveConfigData,
} from "./AdminIncentivesTab";
import AdminPptEligibilityTab, {
  type AdminPptEligibilityState,
} from "./AdminPptEligibilityTab";
import PayoutCard from "./PayoutCard";
import type { PptRequestData } from "./PptRequestCard";
import PptRequestsTab from "./PptRequestsTab";
import type { PayoutTransaction } from "./types";

function TransactionGrid({
  transactions,
  emptyMessage,
}: {
  transactions: PayoutTransaction[];
  emptyMessage: string;
}) {
  if (transactions.length === 0) {
    return <EmptyState description={emptyMessage} />;
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
  pptRequests,
  bonusConfig,
  bonusCandidates,
  incentiveConfig,
  incentiveAwards,
  pptEligibilityStates,
}: {
  pending: PayoutTransaction[];
  paid: PayoutTransaction[];
  rejected: PayoutTransaction[];
  pptRequests: PptRequestData[];
  bonusConfig: BonusConfigData;
  bonusCandidates: BonusReviewCandidate[];
  incentiveConfig: IncentiveConfigData;
  incentiveAwards: AdminIncentiveAwardData[];
  pptEligibilityStates: AdminPptEligibilityState[];
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const availableTabs = new Set([
    ...(pptRequests.length > 0 ? ["ppt-requests"] : []),
    "bonuses",
    "incentives",
    "ppt-eligibility",
    "pending",
    "paid",
    "rejected",
  ]);
  const defaultValue = availableTabs.has(requestedTab ?? "")
    ? (requestedTab as string)
    : pptRequests.length > 0
      ? "ppt-requests"
      : pptEligibilityStates.length > 0
        ? "ppt-eligibility"
        : bonusCandidates.length > 0
          ? "bonuses"
          : incentiveAwards.some((award) => award.status === "HELD")
            ? "incentives"
            : "pending";

  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList mb="lg">
        {pptRequests.length > 0 && (
          <TabsTab value="ppt-requests">
            PPT Requests ({pptRequests.length})
          </TabsTab>
        )}
        <TabsTab value="bonuses">Bonuses ({bonusCandidates.length})</TabsTab>
        <TabsTab value="incentives">
          Incentives ({incentiveAwards.length})
        </TabsTab>
        <TabsTab value="ppt-eligibility">
          PPT Eligibility ({pptEligibilityStates.length})
        </TabsTab>
        <TabsTab value="pending">Pending ({pending.length})</TabsTab>
        <TabsTab value="paid">Paid ({paid.length})</TabsTab>
        <TabsTab value="rejected">Rejected ({rejected.length})</TabsTab>
      </TabsList>

      {pptRequests.length > 0 && (
        <TabsPanel value="ppt-requests">
          <PptRequestsTab requests={pptRequests} />
        </TabsPanel>
      )}

      <TabsPanel value="bonuses">
        <AdminBonusesTab config={bonusConfig} candidates={bonusCandidates} />
      </TabsPanel>

      <TabsPanel value="incentives">
        <AdminIncentivesTab config={incentiveConfig} awards={incentiveAwards} />
      </TabsPanel>

      <TabsPanel value="ppt-eligibility">
        <AdminPptEligibilityTab states={pptEligibilityStates} />
      </TabsPanel>

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
