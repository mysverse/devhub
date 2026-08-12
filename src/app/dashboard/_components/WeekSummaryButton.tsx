"use client";

import { Button, Stack, Text } from "@mantine/core";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { summarizeMyWeekForMe } from "@/app/dashboard/actions";
import { useAiAssistAvailable } from "@/components/ai-assist/AiAssistAvailability";
import type { WeekSummaryResult } from "@/lib/llm-prompts";

/**
 * The narrative half of the week card, on a button rather than the render path.
 *
 * The numbers above it are already true and already rendered. This adds a
 * sentence over them, and it costs a model call — so it costs one per press,
 * not one per dashboard load. Twelve reloads of a page that summarised itself
 * would silently exhaust someone's hourly budget and take PPT drafting with it.
 */
export default function WeekSummaryButton() {
  const available = useAiAssistAvailable();
  const [summary, setSummary] = useState<WeekSummaryResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) return null;

  if (summary) {
    return (
      <Stack gap={2} maw={420}>
        <Text fz="sm">{summary.headline}</Text>
        {summary.nextStep && (
          <Text fz="xs" c="blue.4">
            {summary.nextStep}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Button
      size="compact-xs"
      variant="subtle"
      color="gray"
      leftSection={<Sparkles size={13} />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await summarizeMyWeekForMe();
          if (!outcome.available || !outcome.summary) {
            toast.info("No summary this time — the numbers above still stand.");
            return;
          }
          setSummary(outcome.summary);
        })
      }
    >
      Summarise my week
    </Button>
  );
}
