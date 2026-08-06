import type { Metadata } from "next";
import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import {
  getAssistantConversation,
  listAssistantConversations,
} from "@/lib/assistant";
import { getSession } from "@/lib/auth-utils";
import { isAssistantConfigured } from "@/lib/llm";
import { buildSocialMetadata } from "@/lib/social-previews";
import AssistantClient from "./AssistantClient";

export const metadata: Metadata = buildSocialMetadata("/dashboard/assistant");

export default function AssistantPage() {
  return (
    <PageContainer>
      <PageHeader
        title="DevHub Assistant"
        subtitle="Shape an idea, understand your work, or prepare a task change."
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AssistantContent />
      </Suspense>
    </PageContainer>
  );
}

async function AssistantContent() {
  const { userId } = await getSession();
  if (!userId) return null;
  const conversations = await listAssistantConversations(userId);
  const active = conversations[0]
    ? await getAssistantConversation(userId, conversations[0].id)
    : null;
  return (
    <AssistantClient
      initialConversations={conversations}
      initialConversation={active}
      available={isAssistantConfigured()}
    />
  );
}
