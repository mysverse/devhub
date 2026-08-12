"use client";

import { Button, Stack, Text } from "@mantine/core";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAiAssistAvailable } from "@/components/ai-assist/AiAssistAvailability";
import type { BonusMonthSummary } from "@/lib/llm-prompts";
import { summarizeBonusMonthForAdmin } from "./bonus-actions";

/**
 * Groups one developer-month of finished work so an admin can see the shape of
 * it before reading twelve issue titles.
 *
 * Advisory in the strongest sense available: the prompt type has no amount
 * field, so this cannot propose money even by accident. The amounts stay where
 * they are — deterministic, capped by maxAmount, and confirmed by a person
 * through approveMonthlyBonus, whose in-transaction PPT check is the last place
 * double payment is catchable.
 */
export default function BonusMonthSummaryButton({
  group,
}: {
  group: { userId: string; currency: string; period: string };
}) {
  const available = useAiAssistAvailable();
  const [summary, setSummary] = useState<BonusMonthSummary | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) return null;

  if (summary) {
    return (
      <Stack gap={4} maw={340}>
        {summary.themes.map((theme) => (
          <Text key={theme.label} fz="xs">
            <Text span fw={600}>
              {theme.label}
            </Text>{" "}
            <Text span c="dimmed">
              {theme.identifiers.join(", ")}
            </Text>
          </Text>
        ))}
        {summary.questions.map((question) => (
          <Text key={question} fz="xs" c="yellow.5">
            {question}
          </Text>
        ))}
      </Stack>
    );
  }

  return (
    <Button
      size="compact-xs"
      variant="subtle"
      color="gray"
      leftSection={<Sparkles size={12} />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await summarizeBonusMonthForAdmin({
            userId: group.userId,
            currency: group.currency,
            period: group.period,
          });
          if (!outcome.available || !outcome.summary) {
            toast.info("No summary this time — the list below is the record.");
            return;
          }
          setSummary(outcome.summary);
        })
      }
    >
      Summarise month
    </Button>
  );
}
