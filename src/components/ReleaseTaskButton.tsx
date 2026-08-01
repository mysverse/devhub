"use client";

import { Button, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { releaseIssue } from "@/app/dashboard/actions";
import { signIn } from "@/lib/auth-client";
import ConfirmModal from "./ConfirmModal";

type ReleaseTaskButtonProps = {
  issueId: string;
  identifier?: string | null;
  compact?: boolean;
};

/**
 * Positive-framed self-unassign: releasing a task you won't get to is good
 * citizenship, not a defeat — it goes straight back to the board.
 */
export default function ReleaseTaskButton({
  issueId,
  identifier,
  compact = false,
}: ReleaseTaskButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [opened, { open, close }] = useDisclosure(false);

  function handleRelease() {
    startTransition(async () => {
      const result = await releaseIssue(issueId);

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard/ppts",
        });
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${identifier ?? "Task"} is back on the board. Thanks for freeing it up for someone else.`,
      );
      close();
    });
  }

  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        color="teal"
        leftSection={<Undo2 size={12} />}
        onClick={open}
      >
        {compact ? "Release" : "Release task"}
      </Button>
      <ConfirmModal
        opened={opened}
        onClose={close}
        onConfirm={handleRelease}
        title="Release this task?"
        description={
          <Text size="sm" component="span">
            The task returns to the board immediately so anyone (including you,
            later) can claim it. Nothing is held against you — releasing a task
            you won&apos;t get to keeps work moving for everyone.
          </Text>
        }
        tone="neutral"
        confirmLabel="Release task"
        confirmColor="teal"
        confirmIcon={<Undo2 size={14} />}
        loading={isPending}
      />
    </>
  );
}
