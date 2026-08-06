import type { Metadata } from "next";
import { Suspense } from "react";
import { getLinearTeams } from "@/app/dashboard/ppts/actions";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { getSession } from "@/lib/auth-utils";
import { isLlmConfigured } from "@/lib/llm";
import { buildSocialMetadata } from "@/lib/social-previews";
import IdeaConsole from "./IdeaConsole";

export const metadata: Metadata = buildSocialMetadata("/dashboard/ppts/ideas");

export default function IdeasPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Task Ideas"
        subtitle="Work worth doing, picked out from the board, the backlog, and what you tend to build."
        action={
          <LinkButton href="/dashboard/ppts" variant="subtle">
            Back to the board
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <IdeasContent />
      </Suspense>
    </PageContainer>
  );
}

async function IdeasContent() {
  // Session first: this route reads nothing before it, which is what keeps the
  // prerender rule satisfied without an explicit connection().
  const { userId } = await getSession();
  if (!userId) return null;

  const teams = await getLinearTeams();

  return (
    <IdeaConsole
      teams={"teams" in teams ? teams.teams : []}
      canPrompt={isLlmConfigured()}
    />
  );
}
