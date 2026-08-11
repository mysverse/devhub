"use client";

import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { Check, Sparkles, X } from "lucide-react";
import { ScaleIn } from "@/components/animations";
import styles from "./AiAssist.module.css";
import type { AiAssistProposal as Proposal } from "./useAiAssist";

/**
 * The suggestion, beside the draft rather than instead of it.
 *
 * Nothing here touches the field until Accept. That is the whole contract of
 * this feature: the person who signs their name to a proof comment is the
 * person who chose every word in it.
 */
export default function AiAssistProposal({
  proposal,
  onAccept,
  onDiscard,
  disabled,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  return (
    <ScaleIn className={styles.proposal}>
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Sparkles size={13} />
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Suggested rewrite
            </Text>
            {proposal.partial && (
              <Badge size="xs" variant="light" color="gray">
                selection only
              </Badge>
            )}
          </Group>
        </Group>

        <div className={styles.proposalBody}>{proposal.rewrite}</div>

        {proposal.changeNote && (
          <Text size="xs" c="dimmed">
            {proposal.changeNote}
          </Text>
        )}

        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<X size={13} />}
            onClick={onDiscard}
            disabled={disabled}
          >
            Discard
          </Button>
          <Button
            size="compact-sm"
            leftSection={<Check size={13} />}
            onClick={onAccept}
            disabled={disabled}
          >
            Use this
          </Button>
        </Group>
      </Stack>
    </ScaleIn>
  );
}
