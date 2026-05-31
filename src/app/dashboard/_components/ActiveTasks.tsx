import type { Issue } from "@linear/sdk";
import { Alert, Badge, SimpleGrid } from "@mantine/core";
import { Zap } from "lucide-react";
import { redirect } from "next/navigation";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import LinkAnchor from "@/components/LinkAnchor";
import TaskCard from "@/components/TaskCard";
import type { CurrencyCode } from "@/lib/currency";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import { LinearReauthRequiredError, withLinearFallback } from "@/lib/linear";
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
  let assignedIssues: { issue: Issue; labelNames: string[] }[] = [];
  let linearError: string | null = null;

  try {
    assignedIssues = await withLinearFallback(userId, async (client) => {
      const response = await client.issues({
        first: 10,
        filter: {
          assignee: { id: { eq: linearId } },
        },
      });

      const issuesWithState = await Promise.all(
        response.nodes.map(async (issue) => {
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
        <Alert color="red">Could not load assigned tasks: {linearError}</Alert>
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
      {header}
      <StaggerContainer>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {assignedIssues.map(({ issue, labelNames }) => {
            const hasPptLabel = labelNames.some(
              (label) => label.toUpperCase() === "PPT",
            );
            const bonus = bonusByIssueId.get(issue.id);
            const pptState = pptStateByIssueId.get(issue.id);
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
                />
              </StaggerItem>
            );
          })}
        </SimpleGrid>
      </StaggerContainer>
    </FadeIn>
  );
}
