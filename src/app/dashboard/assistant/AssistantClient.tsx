"use client";

import AssistantExperience from "@/components/assistant/AssistantExperience";
import type {
  AssistantConversationDto,
  AssistantConversationSummary,
} from "@/lib/assistant-types";

export default function AssistantClient({
  initialConversations,
  initialConversation,
  available,
}: {
  initialConversations: AssistantConversationSummary[];
  initialConversation: AssistantConversationDto | null;
  available: boolean;
}) {
  return (
    <AssistantExperience
      mode="page"
      available={available}
      initialConversations={initialConversations}
      initialConversation={initialConversation}
      quickPrompts={[
        "What am I working on?",
        "Help me scope an idea",
        "Show open PPTs",
      ]}
    />
  );
}
