"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { MessageSquareText } from "lucide-react";
import PptComposerModal from "@/components/ppt-composer/PptComposerModal";

/**
 * Trigger for the progress composer. Everything the modal does — drafts,
 * attachments, the requirement checklist — lives in PptComposerModal, which
 * the proof button shares.
 */
export default function PptProgressButton({
  issueId,
  compact,
  identifier,
  issueUrl,
}: {
  issueId: string;
  compact?: boolean;
  /** Linear identifier, used in the sheet title and pasted screenshot names. */
  identifier?: string;
  issueUrl?: string;
}) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        size={compact ? "xs" : "sm"}
        variant="light"
        color="blue"
        leftSection={<MessageSquareText size={14} />}
        onClick={open}
      >
        Progress
      </Button>

      <PptComposerModal
        mode="progress"
        opened={opened}
        onClose={close}
        issueId={issueId}
        identifier={identifier}
        issueUrl={issueUrl}
      />
    </>
  );
}
