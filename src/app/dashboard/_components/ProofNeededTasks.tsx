import { Alert, Badge, SimpleGrid } from "@mantine/core";
import { ClipboardCheck } from "lucide-react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import TaskCard from "@/components/TaskCard";
import type { CurrencyCode } from "@/lib/currency";
import { describePptNextStep, formatReason } from "@/lib/ppt-eligibility";
import {
  PROOF_ACTIONABLE_REASONS,
  PROOF_ACTIONABLE_STATUSES,
} from "@/lib/ppt-reason-copy";
import prisma from "@/lib/prisma";
import DashboardSectionHeader from "./DashboardSectionHeader";

/**
 * The PPTs a developer has finished and still owes proof on.
 *
 * This exists because "Active Tasks" cannot show them. Every assigned-task
 * query filters Linear states of type `completed` out — correctly, they are
 * not work in progress — but the payout rules ask for proof *after* the task
 * reaches Done. The result was a dead end: the Proof button disappeared at the
 * exact moment it was the only thing the developer needed, and DevHub's own
 * guidance ("post a #ppt-proof comment, the Proof button formats it for you")
 * pointed at a button that was not on the page. Developers fell back to
 * replying inside a Linear thread, which the evaluator does not read as proof.
 *
 * Built entirely from `PptPayoutState` rows rather than a Linear fetch: the
 * row already carries the identifier, title, URL and estimate, it is the same
 * record the payout check reads, and it stays reachable when the issue has
 * aged out of every issue list. That also makes this section free — no extra
 * Linear round trip on a page that already makes several.
 */
export default async function ProofNeededTasks({
  userId,
  currency,
}: {
  userId: string;
  currency: CurrencyCode;
}) {
  const states = await prisma.pptPayoutState.findMany({
    where: {
      userId,
      status: { in: [...PROOF_ACTIONABLE_STATUSES] },
      reason: { in: [...PROOF_ACTIONABLE_REASONS] },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      linearIssueId: true,
      linearIssueIdentifier: true,
      linearIssueTitle: true,
      linearIssueUrl: true,
      estimate: true,
      status: true,
      reason: true,
    },
  });

  if (states.length === 0) return null;

  return (
    <FadeIn>
      <DashboardSectionHeader
        title="Proof needed"
        subtitle="Finished tasks waiting on your proof before payout"
        icon={<ClipboardCheck size={16} />}
        badge={
          <Badge variant="light" color="yellow">
            {states.length} waiting
          </Badge>
        }
      />
      <Alert variant="light" color="yellow" mb="md">
        These tasks are done in Linear, so they have left your active list — but
        the payout check is still waiting on proof. Post it with the Proof
        button below and DevHub re-runs the check straight away.
      </Alert>
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {states.map((state) => {
            const nextStep = describePptNextStep(state.status, state.reason);

            return (
              <StaggerItem key={state.linearIssueId}>
                {/* Same anchor id ActiveTasks uses: the payout notifications
                    deep-link to /dashboard/ppts#task-<issueId>, and until this
                    section existed those links landed on a page with no such
                    element. */}
                <div id={`task-${state.linearIssueId}`}>
                  <TaskCard
                    issueId={state.linearIssueId}
                    identifier={state.linearIssueIdentifier ?? "PPT"}
                    title={state.linearIssueTitle ?? "Untitled PPT task"}
                    url={state.linearIssueUrl ?? ""}
                    estimate={state.estimate}
                    variant="active"
                    currency={currency}
                    isPpt
                    proofStatus={state.status}
                    proofReason={
                      state.reason ? formatReason(state.reason) : null
                    }
                    proofNextStep={nextStep.action}
                    proofOwner={nextStep.owner}
                  />
                </div>
              </StaggerItem>
            );
          })}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}
