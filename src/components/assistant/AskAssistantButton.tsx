"use client";

import { Button } from "@mantine/core";
import { MessageCircleQuestionMark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAiAssistAvailable } from "@/components/ai-assist/AiAssistAvailability";

/**
 * "Explain this to me" next to something DevHub already explains deterministically.
 *
 * Deliberately not a new model surface. The deterministic copy beside it —
 * explainTransaction(), explainBonusIneligibility(), the week card — is the
 * answer, always available and identical everywhere. This is for the follow-up
 * that copy cannot anticipate: "why THIS one", "what do I do now", "is that
 * normal". The assistant already has read tools for the person's own data and
 * redacts everything twice, so the right move is to open it with the question
 * already typed rather than build a second explainer.
 *
 * It also rides the chat budget rather than the one-shot one, so a curious
 * developer cannot starve their own PPT drafting.
 */
export default function AskAssistantButton({
  prompt,
  label = "Ask DevHub",
  entryPoint,
  variant = "subtle",
}: {
  /** The question, pre-typed. Written in the developer's voice, not DevHub's. */
  prompt: string;
  label?: string;
  /** Recorded on the conversation so the entry points can be compared later. */
  entryPoint: string;
  variant?: "subtle" | "default" | "light";
}) {
  const available = useAiAssistAvailable();
  const [opening, setOpening] = useState(false);

  if (!available) return null;

  async function open() {
    setOpening(true);
    try {
      const response = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryPoint }),
      });
      const data = (await response.json()) as {
        conversation?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.conversation) {
        throw new Error(data.error ?? "Could not open the assistant.");
      }
      window.dispatchEvent(
        new CustomEvent("devhub:assistant-open", {
          detail: {
            conversationId: data.conversation.id,
            initialPrompt: prompt,
          },
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not open the assistant.",
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button
      size="compact-xs"
      variant={variant}
      color="gray"
      leftSection={<MessageCircleQuestionMark size={13} />}
      loading={opening}
      onClick={open}
    >
      {label}
    </Button>
  );
}
