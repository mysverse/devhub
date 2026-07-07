import { Alert, Badge, SimpleGrid } from "@mantine/core";
import { Zap } from "lucide-react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import LinkAnchor from "@/components/LinkAnchor";
import TaskCard from "@/components/TaskCard";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { getAssignedActiveIssuesForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import type { IssueDTO } from "@/lib/linear-queries";
import { getUnassignHours, getWarningHours } from "@/lib/ppt-assignment-watch";
import { getAssignmentWatchTiming } from "@/lib/ppt-assignment-watch-activity";
import { describePptNextStep } from "@/lib/ppt-eligibility";
import prisma from "@/lib/prisma";
import ActiveTasksEmptyState from "./ActiveTasksEmptyState";
import DashboardSectionHeader from "./DashboardSectionHeader";

type Props = {
  linearId: string;
  userId: string;
  currency: CurrencyCode;
};

export default async function ActiveTasks({
  linearId,
  userId,
  currency,
}: Props) {
  let assignedIssues: IssueDTO[] = [];
  let linearError: string | null = null;

  try {
    assignedIssues = (
      await getAssignedActiveIssuesForUser(userId, linearId)
    ).slice(0, 10);
  } catch (e) {
    linearError = resolveLinearFetchError(e, "/dashboard", "active tasks");
  }

  const header = (
    <DashboardSectionHeader
      title="Active Tasks"
      subtitle="Your work in progress"
      icon={<Zap size={16} />}
      badge={
        assignedIssues.length > 0 ? (
          <Badge variant="light" color="blue">
            {assignedIssues.length} in progress
          </Badge>
        ) : undefined
      }
      action={
        <LinkAnchor href="/dashboard/ppts" fz="sm" fw={500}>
          View PPT Board &rarr;
        </LinkAnchor>
      }
    />
  );

  if (linearError) {
    return (
      <>
        {header}
        <Alert color="red">{linearError}</Alert>
      </>
    );
  }

  if (assignedIssues.length === 0) {
    return (
      <>
        {header}
        <ActiveTasksEmptyState />
      </>
    );
  }

  const bonusCandidates = await prisma.bonusCandidate.findMany({
    where: {
      userId,
      linearIssueId: {
        in: assignedIssues.map((issue) => issue.id),
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
        in: assignedIssues.map((issue) => issue.id),
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
  const assignmentWatches = await prisma.pptAssignmentWatch.findMany({
    where: {
      userId,
      linearIssueId: {
        in: assignedIssues.map((issue) => issue.id),
      },
      assigneeLinearId: linearId,
      status: { in: ["ACTIVE", "WARNED", "SNOOZED"] },
    },
    select: {
      linearIssueId: true,
      status: true,
      lastActivityAt: true,
      snoozedUntil: true,
      warningCount: true,
    },
  });
  const warningHours = getWarningHours();
  const unassignHours = getUnassignHours();
  const assignmentWatchByIssueId = new Map(
    assignmentWatches.map((watch) => {
      const timing = getAssignmentWatchTiming({
        lastActivityAt: watch.lastActivityAt,
        status: watch.status,
        snoozedUntil: watch.snoozedUntil,
        warningHours,
        unassignHours,
      });
      return [
        watch.linearIssueId,
        {
          status: watch.status,
          lastActivityAt: watch.lastActivityAt.toISOString(),
          warningAt: timing.warningAt.toISOString(),
          unassignAt: timing.unassignAt.toISOString(),
          snoozedUntil: watch.snoozedUntil?.toISOString() ?? null,
          warningCount: watch.warningCount,
        },
      ] as const;
    }),
  );

  return (
    <FadeIn>
      {header}
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {assignedIssues.map((issue) => {
            const hasPptLabel = issue.labelNames.some(
              (label) => label.toUpperCase() === "PPT",
            );
            const bonus = bonusByIssueId.get(issue.id);
            const pptState = pptStateByIssueId.get(issue.id);
            const assignmentWatch = assignmentWatchByIssueId.get(issue.id);
            const proofNextStep = pptState
              ? describePptNextStep(pptState.status, pptState.reason).action
              : null;
            const bonusCurrency = bonus?.currency === "ROBUX" ? "ROBUX" : "MYR";
            const earningsText = hasPptLabel
              ? issue.estimate
                ? `${formatAmount(
                    estimateToAmount(issue.estimate, currency),
                    currency,
                  )} (Pending)`
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
                  proofNextStep={proofNextStep}
                  assignmentWatch={assignmentWatch ?? null}
                />
              </StaggerItem>
            );
          })}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}
