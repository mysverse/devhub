"use client";

import { Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { Check, CircleAlert, Sparkles } from "lucide-react";
import type { WritingReviewResult } from "@/lib/llm-prompts";
import styles from "./AiAssist.module.css";

const HEADLINE: Record<WritingReviewResult["readiness"], string> = {
  ready: "Nothing stood out",
  thin: "A reviewer will probably ask about this",
  unclear: "A reviewer may not follow what was done",
};

/**
 * The advisory pass, rendered as a sibling of the requirement checklist and
 * never as part of it.
 *
 * The checklist means one specific thing — "this is what gates the payout" —
 * and it is the only thing on the screen that means it. Mixing a model's
 * opinion into those rows would make a green tick stop being a promise. So this
 * block is visually separate, labelled as an opinion, and blocks nothing:
 * `unmetRequired()` never sees it and the submit button never reads it.
 */
export default function AiAssistConcerns({
  review,
  onDismiss,
}: {
  review: WritingReviewResult;
  onDismiss: () => void;
}) {
  const clear = review.concerns.length === 0;

  return (
    <div className={styles.concerns}>
      <Stack gap={8}>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Sparkles size={13} />
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Before you post — a second read, not a decision
            </Text>
          </Group>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </Group>

        <Text size="sm" fw={500}>
          {HEADLINE[review.readiness]}
        </Text>

        {clear ? (
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <ThemeIcon
              size="sm"
              radius="xl"
              variant="light"
              color="green"
              mt={2}
            >
              <Check size={12} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              The checklist above is still what decides whether the payout
              releases.
            </Text>
          </Group>
        ) : (
          review.concerns.map((concern) => (
            <Group key={concern.what} gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon
                size="sm"
                radius="xl"
                variant="light"
                color="yellow"
                mt={2}
              >
                <CircleAlert size={12} />
              </ThemeIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm">{concern.what}</Text>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.45 }}>
                  {concern.fix}
                </Text>
              </div>
            </Group>
          ))
        )}
      </Stack>
    </div>
  );
}
