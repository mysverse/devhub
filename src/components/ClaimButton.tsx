"use client";

import { Button, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Hand, UserCog } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { claimIssue } from "@/app/dashboard/actions";
import { signIn } from "@/lib/auth-client";
import ConfirmModal from "./ConfirmModal";

type ClaimButtonProps = {
  issueId: string;
  assigneeName?: string | null;
};

export default function ClaimButton({
  issueId,
  assigneeName,
}: ClaimButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticClaimed, setOptimisticClaimed] = useOptimistic(
    false,
    (_state, next: boolean) => next,
  );
  const [opened, { open, close }] = useDisclosure(false);

  function handleClaim() {
    startTransition(async () => {
      setOptimisticClaimed(true);
      const result = await claimIssue(issueId);

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard/ppts",
        });
        return;
      }

      if (result.error) {
        setOptimisticClaimed(false);
        toast.error(result.error);
        return;
      }

      toast.success(assigneeName ? "Task reassigned to you" : "Task claimed");
      close();
    });
  }

  if (assigneeName) {
    return (
      <>
        <Button
          size="xs"
          variant="light"
          color="yellow"
          leftSection={<UserCog size={12} />}
          onClick={open}
        >
          Reassign to me
        </Button>
        <ConfirmModal
          opened={opened}
          onClose={close}
          onConfirm={handleClaim}
          title="Reassign task?"
          description={
            <Text size="sm" component="span">
              This task is currently assigned to <strong>{assigneeName}</strong>
              . Reassigning takes it over for you — they&apos;ll lose any
              in-progress work attribution.
            </Text>
          }
          tone="warning"
          confirmLabel="Reassign to me"
          confirmIcon={<UserCog size={14} />}
          loading={isPending}
        />
      </>
    );
  }

  return (
    <Button
      size="xs"
      variant="light"
      color="blue"
      leftSection={<Hand size={12} />}
      onClick={handleClaim}
      loading={isPending}
      disabled={optimisticClaimed}
    >
      {optimisticClaimed ? "Claimed ✓" : "Claim Task"}
    </Button>
  );
}
