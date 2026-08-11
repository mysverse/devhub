"use client";

import { Button, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ClipboardCheck, RotateCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { retryPptPayoutCheck } from "@/app/dashboard/ppts/actions";
import PptComposerModal from "@/components/ppt-composer/PptComposerModal";
import { signIn } from "@/lib/auth-client";

/**
 * Trigger for the proof composer, plus the manual payout re-check.
 *
 * Retry stays here rather than inside the modal: it is what you press when the
 * proof is already posted and the payout has not moved, so it must be reachable
 * without opening a composer that would ask you to write proof again.
 */
export default function PptProofButton({
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
  const [retrying, startRetryTransition] = useTransition();

  function handleRetry() {
    const toastId = toast.loading("Queueing payout check...");

    startRetryTransition(async () => {
      const result = await retryPptPayoutCheck(issueId);

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard",
        });
        return;
      }
      if (result.error) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success("PPT payout check queued", { id: toastId });
    });
  }

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <Button
          size={compact ? "xs" : "sm"}
          variant="light"
          color="green"
          leftSection={<ClipboardCheck size={14} />}
          onClick={open}
        >
          Proof
        </Button>
        <Button
          size={compact ? "xs" : "sm"}
          variant="subtle"
          color="gray"
          leftSection={<RotateCw size={14} />}
          loading={retrying}
          onClick={handleRetry}
        >
          Retry
        </Button>
      </Group>

      <PptComposerModal
        mode="proof"
        opened={opened}
        onClose={close}
        issueId={issueId}
        identifier={identifier}
        issueUrl={issueUrl}
      />
    </>
  );
}
