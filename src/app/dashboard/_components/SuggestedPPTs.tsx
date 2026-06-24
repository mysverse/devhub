import { Sparkles } from "lucide-react";
import { Carousel } from "motion-plus/react";
import LinkAnchor from "@/components/LinkAnchor";
import TaskCard from "@/components/TaskCard";
import type { CurrencyCode } from "@/lib/currency";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import type { IssueDTO } from "@/lib/linear-queries";
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

  return (
    <>
      <DashboardSectionHeader
        title="Suggested for You"
        subtitle="High-value tasks available to claim, sorted by payout"
        icon={<Sparkles size={16} />}
        action={
          <LinkAnchor href="/dashboard/ppts" fz="sm" fw={500}>
            View all PPTs &rarr;
          </LinkAnchor>
        }
      />
      <Carousel
        gap={20}
        items={issues
          .slice(0, 6)
          .map((issue) => (
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
            />
          ))}
      />
    </>
  );
}
