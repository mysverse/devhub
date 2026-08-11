"use client";

import { Button, Group, Text, Tooltip } from "@mantine/core";
import { ClipboardCheck, Sparkles } from "lucide-react";
import { AI_ASSIST_ACTIONS } from "@/lib/ai-assist-config";
import styles from "./AiAssist.module.css";
import AiAssistProposal from "./AiAssistProposal";
import type { useAiAssist } from "./useAiAssist";

export type AiAssistState = ReturnType<typeof useAiAssist>;

/**
 * The button row and the proposal it produces.
 *
 * Presentational on purpose — it takes the state rather than owning it, so a
 * host like the PPT composer can put the advisory review rows somewhere else
 * entirely (next to the requirement checklist, where they belong) while this
 * stays next to the textarea.
 */
export default function AiAssistBar({
  assist,
  compact,
}: {
  assist: AiAssistState;
  /** Sit inline with existing controls rather than owning a row. */
  compact?: boolean;
}) {
  if (!assist.visible) return null;

  // A cap is not a failure and must not look like one: the row collapses to a
  // sentence that tells the truth and gets out of the way.
  if (assist.capped) {
    return (
      <Text size="xs" c="dimmed">
        Writing help is rested for the next hour. Your draft is fine as it is.
      </Text>
    );
  }

  const tooShort = !assist.eligibility.ok;
  const hint = tooShort
    ? `Write a little more first — at least ${assist.config.minInputChars} characters.`
    : "Suggests a rewrite. Nothing changes until you accept it.";

  return (
    <>
      <Group gap={6} className={styles.bar}>
        <Sparkles size={13} opacity={0.6} />
        {assist.actions.map((action) => (
          <Tooltip key={action} label={hint} withArrow openDelay={400}>
            <Button
              size="compact-xs"
              variant={compact ? "subtle" : "default"}
              loading={assist.running === action}
              disabled={assist.busy || tooShort}
              onClick={() => assist.run(action)}
            >
              {AI_ASSIST_ACTIONS[action].label}
            </Button>
          </Tooltip>
        ))}

        {assist.offersReview && (
          <Tooltip
            label="Reads it the way a reviewer will. Changes nothing."
            withArrow
            openDelay={400}
          >
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<ClipboardCheck size={13} />}
              loading={assist.running === "review"}
              disabled={assist.busy || tooShort}
              onClick={() => assist.runReview()}
            >
              Check before posting
            </Button>
          </Tooltip>
        )}
      </Group>

      {assist.proposal && (
        <AiAssistProposal
          proposal={assist.proposal}
          onAccept={assist.accept}
          onDiscard={assist.discard}
          disabled={assist.busy}
        />
      )}
    </>
  );
}
