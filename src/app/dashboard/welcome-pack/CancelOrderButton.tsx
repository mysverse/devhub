"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import { cancelWelcomePackOrder } from "./actions";

export default function CancelOrderButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    const res = await cancelWelcomePackOrder();
    setBusy(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Order cancelled");
    close();
  }

  return (
    <>
      <Button
        variant="subtle"
        color="red"
        leftSection={<X size={16} />}
        onClick={open}
        w="fit-content"
      >
        Cancel order
      </Button>

      <ConfirmModal
        opened={opened}
        onClose={close}
        onConfirm={handleConfirm}
        title="Cancel welcome pack order?"
        description="This action can't be undone. Welcome packs are limited to one per developer for life — once cancelled, you won't be able to submit another order."
        hint="Only cancel if your address or selections need correcting and admins can't help."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        confirmIcon={<X size={16} />}
        loading={busy}
      />
    </>
  );
}
