"use client";

import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { MessageSquareText } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitPptProgress } from "@/app/dashboard/ppts/actions";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";
import { signIn } from "@/lib/auth-client";
import { PPT_PROGRESS_TEMPLATE } from "@/lib/ppt-progress";

export default function PptProgressButton({
  issueId,
  compact,
}: {
  issueId: string;
  compact?: boolean;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [body, setBody] = useState(PPT_PROGRESS_TEMPLATE);
  const [submitting, startTransition] = useTransition();

  function handleSubmit() {
    const draft = body;
    close();
    const toastId = toast.loading("Posting progress update...");

    startTransition(async () => {
      const result = await submitPptProgress(issueId, draft);

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
      toast.success("Progress update posted", { id: toastId });
      setBody(PPT_PROGRESS_TEMPLATE);
    });
  }

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

      <Modal
        opened={opened}
        onClose={submitting ? () => {} : close}
        title="Post progress"
        centered
        radius="md"
        transitionProps={MODAL_TRANSITION}
        overlayProps={{ ...OVERLAY_PROPS }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This posts a Linear comment and refreshes the assignment-watch
            timer. Use the separate proof flow when the PPT is complete.
          </Text>
          <Textarea
            minRows={7}
            autosize
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button
              color="blue"
              onClick={handleSubmit}
              loading={submitting}
              leftSection={<MessageSquareText size={14} />}
            >
              Post Progress
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
