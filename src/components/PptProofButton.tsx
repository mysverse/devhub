"use client";

import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ClipboardCheck, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  retryPptPayoutCheck,
  submitPptProof,
} from "@/app/dashboard/ppts/actions";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";
import { signIn } from "@/lib/auth-client";

export default function PptProofButton({
  issueId,
  compact,
}: {
  issueId: string;
  compact?: boolean;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [body, setBody] = useState("");
  const [submitting, startSubmitTransition] = useTransition();
  const [retrying, startRetryTransition] = useTransition();

  function handleSubmit() {
    const draft = body;
    close();
    const toastId = toast.loading("Submitting PPT proof...");

    startSubmitTransition(async () => {
      const result = await submitPptProof(issueId, draft);

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard",
        });
        return;
      }
      if (result.error) {
        setBody(draft);
        open();
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success("PPT proof submitted", { id: toastId });
      setBody("");
    });
  }

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

      <Modal
        opened={opened}
        onClose={submitting ? () => {} : close}
        title="Submit PPT proof"
        centered
        radius="md"
        transitionProps={MODAL_TRANSITION}
        overlayProps={{ ...OVERLAY_PROPS }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Include what changed, proof links or screenshots, where it is
            implemented, and how it was verified. DevHub will add #ppt-proof if
            it is missing.
          </Text>
          <Textarea
            minRows={6}
            autosize
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            placeholder={`#ppt-proof\n\nWhat changed:\nProof links/screenshots:\nLocation:\nVerification:`}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button
              color="green"
              onClick={handleSubmit}
              loading={submitting}
              leftSection={<ClipboardCheck size={14} />}
            >
              Submit Proof
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
