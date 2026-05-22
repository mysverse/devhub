"use client";

import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ClipboardCheck, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  retryPptPayoutCheck,
  submitPptProof,
} from "@/app/dashboard/ppts/actions";
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
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    setSubmitting(true);
    const result = await submitPptProof(issueId, body);
    setSubmitting(false);

    if ("reauth" in result && result.reauth) {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: "/dashboard",
      });
      return;
    }
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT proof submitted");
    setBody("");
    close();
    router.refresh();
  }

  async function handleRetry() {
    setRetrying(true);
    const result = await retryPptPayoutCheck(issueId);
    setRetrying(false);

    if ("reauth" in result && result.reauth) {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: "/dashboard",
      });
      return;
    }
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("PPT payout check queued");
    router.refresh();
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
        overlayProps={{ blur: 4 }}
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
