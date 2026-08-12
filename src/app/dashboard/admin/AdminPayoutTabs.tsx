"use client";

import { SimpleGrid, Tabs, TabsList, TabsPanel, TabsTab } from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import SectionUnavailable from "@/components/SectionUnavailable";
import AdminBonusesTab, {
  type BonusConfigData,
  type BonusReviewCandidate,
} from "./AdminBonusesTab";
import AdminIncentivesTab, {
  type AdminIncentiveAwardData,
  type IncentiveConfigData,
} from "./AdminIncentivesTab";
import AdminPptAssignmentWatchTab, {
  type AdminPptAssignmentWatchRow,
} from "./AdminPptAssignmentWatchTab";
import AdminPptEligibilityTab, {
  type AdminPptEligibilityState,
} from "./AdminPptEligibilityTab";
import PayoutCard from "./PayoutCard";
import type { PptRequestData } from "./PptRequestCard";
import PptRequestsTab from "./PptRequestsTab";
import type { PayoutTransaction } from "./types";

/**
 * Tabs whose data can fail independently, mapped to the short cause of the
 * failure (`P6000`, `503`) or null when the section loaded.
 */
export type AdminSectionFailures = Record<AdminTabValue, string | null>;

type AdminTabValue =
  | "ppt-requests"
  | "bonuses"
  | "incentives"
  | "ppt-watch"
  | "ppt-eligibility"
  | "pending"
  | "paid"
  | "rejected";

/**
 * A tab's label. A failed section shows a warning glyph rather than "(0)" —
 * this board is where money is approved, and a count of zero on a tab whose
 * query died reads as "nothing to do here".
 */
function TabLabel({
  children,
  count,
  failure,
}: {
  children: React.ReactNode;
  count: number;
  failure: string | null;
}) {
  return (
    <>
      {children}{" "}
      {failure ? (
        <TriangleAlert
          size={13}
          style={{ display: "inline", verticalAlign: "-2px" }}
          aria-label="could not be loaded"
        />
      ) : (
        `(${count})`
      )}
    </>
  );
}

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
  failures,
  pending,
  paid,
  rejected,
  pptRequests,
  bonusConfig,
  bonusCandidates,
  incentiveConfig,
  incentiveAwards,
  pptEligibilityStates,
  pptAssignmentWatches,
}: {
  failures: AdminSectionFailures;
  pending: PayoutTransaction[];
  paid: PayoutTransaction[];
  rejected: PayoutTransaction[];
  pptRequests: PptRequestData[];
  /** null when the config could not be read — the tab shows the fault. */
  bonusConfig: BonusConfigData | null;
  bonusCandidates: BonusReviewCandidate[];
  incentiveConfig: IncentiveConfigData | null;
  incentiveAwards: AdminIncentiveAwardData[];
  pptEligibilityStates: AdminPptEligibilityState[];
  pptAssignmentWatches: AdminPptAssignmentWatchRow[];
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const attentionWatchCount = pptAssignmentWatches.filter((watch) =>
    ["WARNED", "UNASSIGNED"].includes(watch.status),
  ).length;
  // A failed PPT-requests section has a length of 0, which would otherwise
  // drop the tab entirely and hide the failure along with it.
  const showPptRequests = pptRequests.length > 0 || failures["ppt-requests"];
  const availableTabs = new Set([
    ...(showPptRequests ? ["ppt-requests"] : []),
    "bonuses",
    "incentives",
    "ppt-watch",
    "ppt-eligibility",
    "pending",
    "paid",
    "rejected",
  ]);
  // Never open on a tab that has nothing to show. A failed section's counts
  // are unknown, not zero, so they cannot be used to route attention — but a
  // failure is itself worth landing on, since the admin needs to know that
  // work may be waiting behind it.
  const defaultValue = availableTabs.has(requestedTab ?? "")
    ? (requestedTab as string)
    : (Object.entries(failures).find(
        ([tab, failure]) => failure && availableTabs.has(tab),
      )?.[0] ??
      (pptRequests.length > 0
        ? "ppt-requests"
        : attentionWatchCount > 0
          ? "ppt-watch"
          : pptEligibilityStates.length > 0
            ? "ppt-eligibility"
            : bonusCandidates.length > 0
              ? "bonuses"
              : incentiveAwards.some((award) => award.status === "HELD")
                ? "incentives"
                : "pending"));

  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList mb="lg">
        {showPptRequests && (
          <TabsTab value="ppt-requests">
            <TabLabel
              count={pptRequests.length}
              failure={failures["ppt-requests"]}
            >
              PPT Requests
            </TabLabel>
          </TabsTab>
        )}
        <TabsTab value="bonuses">
          <TabLabel count={bonusCandidates.length} failure={failures.bonuses}>
            Bonuses
          </TabLabel>
        </TabsTab>
        <TabsTab value="incentives">
          <TabLabel
            count={incentiveAwards.length}
            failure={failures.incentives}
          >
            Incentives
          </TabLabel>
        </TabsTab>
        <TabsTab value="ppt-watch">
          <TabLabel
            count={pptAssignmentWatches.length}
            failure={failures["ppt-watch"]}
          >
            PPT Watch
          </TabLabel>
        </TabsTab>
        <TabsTab value="ppt-eligibility">
          <TabLabel
            count={pptEligibilityStates.length}
            failure={failures["ppt-eligibility"]}
          >
            PPT Eligibility
          </TabLabel>
        </TabsTab>
        <TabsTab value="pending">
          <TabLabel count={pending.length} failure={failures.pending}>
            Pending
          </TabLabel>
        </TabsTab>
        <TabsTab value="paid">
          <TabLabel count={paid.length} failure={failures.paid}>
            Paid
          </TabLabel>
        </TabsTab>
        <TabsTab value="rejected">
          <TabLabel count={rejected.length} failure={failures.rejected}>
            Rejected
          </TabLabel>
        </TabsTab>
      </TabsList>

      {showPptRequests && (
        <TabsPanel value="ppt-requests">
          {failures["ppt-requests"] ? (
            <SectionUnavailable
              title="PPT requests couldn't be loaded"
              detail={failures["ppt-requests"]}
            />
          ) : (
            <PptRequestsTab requests={pptRequests} />
          )}
        </TabsPanel>
      )}

      <TabsPanel value="bonuses">
        {failures.bonuses || !bonusConfig ? (
          <SectionUnavailable
            title="Bonus review couldn't be loaded"
            detail={failures.bonuses}
          />
        ) : (
          <AdminBonusesTab config={bonusConfig} candidates={bonusCandidates} />
        )}
      </TabsPanel>

      <TabsPanel value="incentives">
        {failures.incentives || !incentiveConfig ? (
          <SectionUnavailable
            title="Incentives couldn't be loaded"
            detail={failures.incentives}
          />
        ) : (
          <AdminIncentivesTab
            config={incentiveConfig}
            awards={incentiveAwards}
          />
        )}
      </TabsPanel>

      <TabsPanel value="ppt-watch">
        {failures["ppt-watch"] ? (
          <SectionUnavailable
            title="Assignment watches couldn't be loaded"
            detail={failures["ppt-watch"]}
          />
        ) : (
          <AdminPptAssignmentWatchTab watches={pptAssignmentWatches} />
        )}
      </TabsPanel>

      <TabsPanel value="ppt-eligibility">
        {failures["ppt-eligibility"] ? (
          <SectionUnavailable
            title="PPT eligibility couldn't be loaded"
            detail={failures["ppt-eligibility"]}
          />
        ) : (
          <AdminPptEligibilityTab states={pptEligibilityStates} />
        )}
      </TabsPanel>

      <TabsPanel value="pending">
        {failures.pending ? (
          <SectionUnavailable
            title="Pending payouts couldn't be loaded"
            detail={failures.pending}
          />
        ) : (
          <TransactionGrid
            transactions={pending}
            emptyMessage="No pending payouts right now! The team is all caught up."
          />
        )}
      </TabsPanel>

      <TabsPanel value="paid">
        {failures.paid ? (
          <SectionUnavailable
            title="Processed payouts couldn't be loaded"
            detail={failures.paid}
          />
        ) : (
          <TransactionGrid
            transactions={paid}
            emptyMessage="No processed payouts yet."
          />
        )}
      </TabsPanel>

      <TabsPanel value="rejected">
        {failures.rejected ? (
          <SectionUnavailable
            title="Rejected payouts couldn't be loaded"
            detail={failures.rejected}
          />
        ) : (
          <TransactionGrid
            transactions={rejected}
            emptyMessage="No rejected payouts."
          />
        )}
      </TabsPanel>
    </Tabs>
  );
}
