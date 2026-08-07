import { Group } from "@mantine/core";
import { ArrowRight, Sparkles } from "lucide-react";
import { Carousel } from "motion-plus/react";
import EmptyState from "@/components/EmptyState";
import LinkAnchor from "@/components/LinkAnchor";
import LinkButton from "@/components/LinkButton";
import TaskCard from "@/components/TaskCard";
import { getClaimContext } from "@/lib/claim-context";
import type { CurrencyCode } from "@/lib/currency";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import type { IssueDTO } from "@/lib/linear-queries";
import { selectCampaignBadge } from "@/lib/payout-campaign";
import { getLiveCampaignRows } from "@/lib/payout-campaign-server";
import prisma from "@/lib/prisma";
import { rankPptsForUser } from "@/lib/task-recommendation-server";
import DashboardSectionHeader from "./DashboardSectionHeader";

type Props = {
  userId: string;
  currency: CurrencyCode;
};

export default async function SuggestedPPTs({ userId, currency }: Props) {
  let issues: IssueDTO[] = [];

  try {
    issues = await getSuggestedPptsForUser(userId);
  } catch (e) {
    resolveLinearFetchError(e, "/dashboard", "suggested PPTs");
    return null;
  }

  // An empty board used to render nothing at all — the exact moment a
  // developer most needs somewhere to go.
  if (issues.length === 0) {
    return (
      <>
        <DashboardSectionHeader
          title="Suggested for You"
          subtitle="Nothing unclaimed on the board right now"
          icon={<Sparkles size={16} />}
        />
        <EmptyState
          title="The board is clear"
          description="Nothing is waiting to be claimed. Ideas can pull work out of the backlog, or suggest something that should exist."
          action={
            <LinkButton
              href="/dashboard/ppts/ideas"
              variant="light"
              rightSection={<ArrowRight size={14} />}
            >
              Get ideas
            </LinkButton>
          }
        />
      </>
    );
  }

  // Previously this was the whole board sorted by payout — the same list for
  // everyone, labelled "Suggested for You". Rank it against what this
  // developer actually does, and show why each task is here.
  const [claimContext, ranked, liveCampaigns, profile] = await Promise.all([
    getClaimContext(userId),
    rankPptsForUser(userId, issues),
    getLiveCampaignRows(),
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: { developerRank: true },
    }),
  ]);

  return (
    <section data-testid="suggested-ppts">
      <DashboardSectionHeader
        title="Suggested for You"
        subtitle="Open tasks matched to your specialties and the size of work you take on"
        icon={<Sparkles size={16} />}
        action={
          <Group gap="md">
            <LinkAnchor href="/dashboard/ppts/ideas" fz="sm" fw={500}>
              Get ideas
            </LinkAnchor>
            <LinkAnchor href="/dashboard/ppts" fz="sm" fw={500}>
              View all PPTs &rarr;
            </LinkAnchor>
          </Group>
        }
      />
      <Carousel
        gap={20}
        items={ranked.slice(0, 6).map(({ task, because }) => {
          const issue = issues.find((candidate) => candidate.id === task.id);
          if (!issue) return null;
          return (
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
              claimContext={claimContext}
              recommendationReason={because}
              campaign={selectCampaignBadge(liveCampaigns, {
                scope: "PPT",
                userId,
                rank: profile?.developerRank ?? null,
                labels: issue.labelNames,
              })}
            />
          );
        })}
      />
    </section>
  );
}
