"use client";

import { Button } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelWelcomePackOrder } from "./actions";

export default function CancelOrderButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (
      !confirm(
        "Cancel this welcome pack order? You won't be able to submit a new one — orders are limited to one per user.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await cancelWelcomePackOrder();
    setBusy(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Order cancelled");
    router.refresh();
  }

  return (
    <Button
      variant="subtle"
      color="red"
      loading={busy}
      onClick={handleClick}
      w="fit-content"
    >
      Cancel order
    </Button>
  );
}
