"use client";

import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelWelcomePackOrder } from "./actions";

export default function CancelOrderButton() {
  const router = useRouter();
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
    router.refresh();
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

      <Modal
        opened={opened}
        onClose={busy ? () => {} : close}
        title="Cancel welcome pack order?"
        centered
        radius="md"
        overlayProps={{ blur: 4 }}
      >
        <Stack gap="md">
          <Group align="flex-start" wrap="nowrap" gap="sm">
            <ThemeIcon color="red" variant="light" size="lg" radius="md">
              <TriangleAlert size={18} />
            </ThemeIcon>
            <Text size="sm">
              This action can&apos;t be undone. Welcome packs are limited to one
              per developer for life — once cancelled, you won&apos;t be able to
              submit another order.
            </Text>
          </Group>

          <Alert color="yellow" variant="light">
            Only cancel if your address or selections need correcting and admins
            can&apos;t help.
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close} disabled={busy}>
              Keep order
            </Button>
            <Button
              color="red"
              loading={busy}
              onClick={handleConfirm}
              leftSection={<X size={16} />}
            >
              Cancel order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
