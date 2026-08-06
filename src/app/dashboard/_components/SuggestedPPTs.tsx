import { Sparkles } from "lucide-react";
import { Carousel } from "motion-plus/react";
import LinkAnchor from "@/components/LinkAnchor";
import TaskCard from "@/components/TaskCard";
import { getClaimContext } from "@/lib/claim-context";
import type { CurrencyCode } from "@/lib/currency";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import type { IssueDTO } from "@/lib/linear-queries";
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

  if (issues.length === 0) return null;

  // Previously this was the whole board sorted by payout — the same list for
  // everyone, labelled "Suggested for You". Rank it against what this
  // developer actually does, and show why each task is here.
  const [claimContext, ranked] = await Promise.all([
    getClaimContext(userId),
    rankPptsForUser(userId, issues),
  ]);

  return (
    <>
      <DashboardSectionHeader
        title="Suggested for You"
        subtitle="Open tasks matched to your specialties and the size of work you take on"
        icon={<Sparkles size={16} />}
        action={
          <LinkAnchor href="/dashboard/ppts" fz="sm" fw={500}>
            View all PPTs &rarr;
          </LinkAnchor>
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
            />
          );
        })}
      />
    </>
  );
}
