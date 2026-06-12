"use client";

import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import { cancelWelcomePackOrder } from "./actions";

export default function CancelOrderButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setBusy(true);
    const res = await cancelWelcomePackOrder();
    setBusy(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Order cancelled");
    router.refresh();
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
        description="Your order will be withdrawn from the review queue. You can place a new order afterwards, as long as ordering is still open."
        hint="Just need to fix a size or address? Use Edit order instead — no need to cancel."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        confirmIcon={<X size={16} />}
        loading={busy}
      />
    </>
  );
}
