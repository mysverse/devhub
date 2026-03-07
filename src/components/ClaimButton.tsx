"use client";

import { Button, Group, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { claimIssue } from "@/app/dashboard/actions";

type ClaimButtonProps = {
  issueId: string;
  assigneeName?: string | null;
};

export default function ClaimButton({
  issueId,
  assigneeName,
}: ClaimButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opened, { open, close }] = useDisclosure(false);
  const router = useRouter();

  async function handleClaim() {
    setLoading(true);
    setError("");
    const result = await claimIssue(issueId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      close();
      router.refresh();
    }
  }

  if (assigneeName) {
    return (
      <>
        <Button size="xs" variant="light" color="yellow" onClick={open}>
          Reassign to me
        </Button>
        <Modal
          opened={opened}
          onClose={close}
          title="Reassign Task"
          centered
          size="sm"
        >
          <Text fz="sm" mb="md">
            This task is currently assigned to <strong>{assigneeName}</strong>.
            Are you sure you want to reassign it to yourself?
          </Text>
          {error && (
            <Text fz="sm" c="red" mb="sm">
              {error}
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button color="yellow" onClick={handleClaim} loading={loading}>
              Reassign to me
            </Button>
          </Group>
        </Modal>
      </>
    );
  }

  return (
    <>
      {error && (
        <Text fz="xs" c="red">
          {error}
        </Text>
      )}
      <Button
        size="xs"
        variant="light"
        color="blue"
        onClick={handleClaim}
        loading={loading}
      >
        Claim Task
      </Button>
    </>
  );
}
