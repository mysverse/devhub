"use client";

import { Button, Select, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { PptSelfBlockReason } from "@prisma/client";
import { OctagonPause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markTaskBlocked, markTaskUnblocked } from "@/app/dashboard/actions";
import { SELF_BLOCK_REASON_LABELS } from "@/lib/payout-policy";
import ConfirmModal from "./ConfirmModal";

const REASON_OPTIONS = Object.entries(SELF_BLOCK_REASON_LABELS).map(
  ([value, label]) => ({ value, label }),
);

type BlockedTaskButtonProps = {
  issueId: string;
  isBlocked: boolean;
  /** Self-block window length, for the modal copy. */
  selfBlockHours?: number;
  compact?: boolean;
};

/**
 * Self-service "I'm blocked": pauses the activity timer without filler Linear
 * comments. Time-boxed and admin-visible on repeats — honest use is free.
 */
export default function BlockedTaskButton({
  issueId,
  isBlocked,
  selfBlockHours = 72,
  compact = false,
}: BlockedTaskButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [opened, { open, close }] = useDisclosure(false);
  const [reason, setReason] = useState<PptSelfBlockReason>("WAITING_REVIEW");
  const [note, setNote] = useState("");

  function handleBlock() {
    startTransition(async () => {
      const result = await markTaskBlocked(
        issueId,
        reason,
        note.trim() || undefined,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Marked blocked — the activity timer is paused for up to ${selfBlockHours}h. Unblock any time.`,
      );
      close();
    });
  }

  function handleUnblock() {
    startTransition(async () => {
      const result = await markTaskUnblocked(issueId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Unblocked — the activity timer restarted fresh.");
    });
  }

  if (isBlocked) {
    return (
      <Button
        size="xs"
        variant="light"
        color="orange"
        leftSection={<Play size={12} />}
        onClick={handleUnblock}
        loading={isPending}
      >
        {compact ? "Unblock" : "I'm unblocked"}
      </Button>
    );
  }

  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        color="orange"
        leftSection={<OctagonPause size={12} />}
        onClick={open}
      >
        {compact ? "Blocked?" : "I'm blocked"}
      </Button>
      <ConfirmModal
        opened={opened}
        onClose={close}
        onConfirm={handleBlock}
        title="Mark this task blocked?"
        description={
          <Text size="sm" component="span">
            This pauses the activity timer for up to{" "}
            <strong>{selfBlockHours} hours</strong> while you wait — no filler
            progress comments needed. It auto-expires, and you can unblock
            sooner. Repeated blocks on the same task are shown to admins so they
            can help unblock you.
          </Text>
        }
        extra={
          <>
            <Select
              label="What are you waiting on?"
              data={REASON_OPTIONS}
              value={reason}
              onChange={(value) => {
                if (value) setReason(value as PptSelfBlockReason);
              }}
              allowDeselect={false}
            />
            <Textarea
              label="Details (optional)"
              placeholder="e.g. Waiting for the API team to merge #142"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              minRows={2}
              autosize
            />
          </>
        }
        tone="warning"
        confirmLabel="Mark blocked"
        confirmColor="orange"
        confirmIcon={<OctagonPause size={14} />}
        loading={isPending}
      />
    </>
  );
}
