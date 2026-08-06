import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { resolveDisplayName } from "@/lib/display-name";
import { getLinearServiceClient } from "@/lib/linear";
import { fetchSuggestedPpts } from "@/lib/linear-queries";
import prisma from "@/lib/prisma";
import { PROFILE_DISPLAY_SELECT } from "@/lib/prisma-select";
import { buildSocialMetadata } from "@/lib/social-previews";
import SuggestTaskConsole from "./SuggestTaskConsole";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/suggest",
);

export default function AdminSuggestPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Suggest a Task"
        subtitle="Point a developer at a specific open task, with the reason it suits them."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminSuggestContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminSuggestContent() {
  await requireAdminPage();

  const client = getLinearServiceClient();
  const openTasks = client
    ? (await fetchSuggestedPpts(client)).filter((issue) => !issue.assignee)
    : [];

  const recent = await prisma.taskSuggestion.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { user: { select: PROFILE_DISPLAY_SELECT } },
  });

  return (
    <SuggestTaskConsole
      tasks={openTasks.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        estimate: issue.estimate,
      }))}
      recent={recent.map((suggestion) => ({
        id: suggestion.id,
        identifier: suggestion.linearIssueIdentifier ?? "—",
        title: suggestion.linearIssueTitle,
        developerName: resolveDisplayName({
          profile: suggestion.user,
          fallback: "developer",
        }),
        reason: suggestion.reason,
        outcome: suggestion.outcome,
        createdAt: suggestion.createdAt.toISOString(),
      }))}
      linearConfigured={Boolean(client)}
    />
  );
}
