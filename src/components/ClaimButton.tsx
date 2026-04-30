"use client";

import { Button, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Hand, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const router = useRouter();

  async function handleClaim() {
    setLoading(true);
    const result = await claimIssue(issueId);

    if ("reauth" in result && result.reauth) {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: "/dashboard/ppts",
      });
      return;
    }

    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success(assigneeName ? "Task reassigned to you" : "Task claimed");
    close();
    setLoading(false);
    router.refresh();
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
          loading={loading}
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
      loading={loading}
    >
      Claim Task
    </Button>
  );
}
