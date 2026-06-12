"use client";

import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ShippingRegion } from "@prisma/client";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";
import { FIELD_LIMITS } from "@/lib/welcome-pack-validation";
import AddressFields, { type AddressValues } from "./AddressFields";
import { type UpdateMyOrderInput, updateMyWelcomePackOrder } from "./actions";

export type EditableOrder = {
  idCardName: string;
  region: ShippingRegion;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string;
  country: string;
  notes: string | null;
  selections: {
    itemId: string;
    itemName: string;
    requiresSize: boolean;
    sizeOptions: string[];
    selectedSize: string | null;
  }[];
};

/**
 * Lets the developer fix sizes, ID-card name, and shipping on their own
 * PENDING order. Item membership stays admin-controlled.
 */
export default function EditOrderButton({ order }: { order: EditableOrder }) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        variant="light"
        leftSection={<Pencil size={16} />}
        onClick={open}
        w="fit-content"
      >
        Edit order
      </Button>
      {/* Remount per open so stale edits don't linger after a cancel. */}
      {opened && <EditOrderModal order={order} opened onClose={close} />}
    </>
  );
}

function EditOrderModal({
  order,
  opened,
  onClose,
}: {
  order: EditableOrder;
  opened: boolean;
  onClose: () => void;
}) {
  const [idCardName, setIdCardName] = useState(order.idCardName);
  const [address, setAddress] = useState<AddressValues>({
    region: order.region,
    recipientName: order.recipientName,
    phone: order.phone,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2 ?? "",
    city: order.city,
    stateProvince: order.stateProvince ?? "",
    postalCode: order.postalCode,
    country: order.country,
  });
  const [notes, setNotes] = useState(order.notes ?? "");
  const [sizes, setSizes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.selections
        .filter((s) => s.selectedSize)
        .map((s) => [s.itemId, s.selectedSize as string]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const sizedSelections = order.selections.filter((s) => s.requiresSize);

  async function handleSave() {
    const input: UpdateMyOrderInput = {
      ...address,
      idCardName,
      addressLine2: address.addressLine2.trim() || undefined,
      stateProvince: address.stateProvince.trim() || undefined,
      notes: notes.trim() || undefined,
      selections: order.selections.map((s) => ({
        itemId: s.itemId,
        selectedSize: s.requiresSize ? sizes[s.itemId] : undefined,
      })),
    };
    setSaving(true);
    const res = await updateMyWelcomePackOrder(input);
    setSaving(false);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Order updated");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit order"
      size="lg"
      centered
      transitionProps={MODAL_TRANSITION}
      overlayProps={OVERLAY_PROPS}
    >
      <Stack gap="md">
        {sizedSelections.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              Sizes
            </Text>
            {sizedSelections.map((s) => (
              <Group key={s.itemId} justify="space-between">
                <Text size="sm">{s.itemName}</Text>
                <Select
                  data={s.sizeOptions}
                  value={sizes[s.itemId] ?? null}
                  onChange={(v) =>
                    setSizes((prev) => ({ ...prev, [s.itemId]: v ?? "" }))
                  }
                  placeholder="Size"
                  w={120}
                  size="xs"
                />
              </Group>
            ))}
          </Stack>
        )}

        <TextInput
          label="ID card name"
          value={idCardName}
          onChange={(e) => setIdCardName(e.currentTarget.value)}
          maxLength={FIELD_LIMITS.idCardName}
          required
        />

        <AddressFields
          values={address}
          onChange={(field, value) =>
            setAddress((prev) => ({ ...prev, [field]: value }))
          }
        />

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          maxLength={FIELD_LIMITS.notes}
          autosize
          minRows={2}
          maxRows={5}
        />

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
