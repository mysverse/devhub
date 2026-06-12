"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import AddressFields, {
  type AddressValues,
} from "@/app/dashboard/welcome-pack/AddressFields";
import { FIELD_LIMITS } from "@/lib/welcome-pack-validation";
import {
  type AdminSelectionInput,
  type AdminShippingInput,
  updateWelcomePackOrderSelectionsAdmin,
  updateWelcomePackOrderShippingAdmin,
  updateWelcomePackOrderTrackingAdmin,
} from "./actions";
import type { AdminOrderRow, AdminPackItem } from "./OrdersTable";

/**
 * Items the admin may put on this order: every active pack item, plus
 * inactive ones already on the order (so legacy selections can stay).
 */
function editableItems(packItems: AdminPackItem[], order: AdminOrderRow) {
  const onOrder = new Set(order.selections.map((s) => s.itemId));
  return packItems.filter((i) => i.isActive || onOrder.has(i.id));
}

export function EditSelectionsModal({
  order,
  packItems,
  opened,
  onClose,
}: {
  order: AdminOrderRow;
  packItems: AdminPackItem[];
  opened: boolean;
  onClose: () => void;
}) {
  const items = editableItems(packItems, order);
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, order.selections.some((s) => s.itemId === i.id)]),
    ),
  );
  const [sizes, setSizes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.selections
        .filter((s) => s.selectedSize)
        .map((s) => [s.itemId, s.selectedSize as string]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    const selections: AdminSelectionInput[] = items
      .filter((i) => included[i.id])
      .map((i) => ({
        itemId: i.id,
        selectedSize: i.requiresSize ? (sizes[i.id] ?? null) : null,
      }));

    setSaving(true);
    const res = await updateWelcomePackOrderSelectionsAdmin(
      order.id,
      selections,
    );
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Selections updated");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Edit items — ${order.developerName}`}
      size="lg"
    >
      <Stack gap="sm">
        {items.map((item) => (
          <Group key={item.id} justify="space-between" wrap="wrap" gap="xs">
            <Checkbox
              label={
                <Group gap={6}>
                  <Text size="sm">{item.name}</Text>
                  {!item.isActive && (
                    <Badge variant="light" color="gray" size="xs">
                      Inactive
                    </Badge>
                  )}
                </Group>
              }
              checked={included[item.id] ?? false}
              onChange={(e) =>
                setIncluded((prev) => ({
                  ...prev,
                  [item.id]: e.currentTarget.checked,
                }))
              }
            />
            {item.requiresSize && included[item.id] && (
              <Select
                data={item.sizeOptions}
                value={sizes[item.id] ?? null}
                onChange={(v) =>
                  setSizes((prev) => ({ ...prev, [item.id]: v ?? "" }))
                }
                placeholder="Size"
                w={120}
                size="xs"
              />
            )}
          </Group>
        ))}

        <Alert color="blue" variant="light">
          Changes are recorded in the order history. The developer is not
          notified automatically.
        </Alert>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save selections
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function EditShippingModal({
  order,
  opened,
  onClose,
}: {
  order: AdminOrderRow;
  opened: boolean;
  onClose: () => void;
}) {
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
  const [idCardName, setIdCardName] = useState(order.idCardName);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    const input: AdminShippingInput = {
      ...address,
      addressLine2: address.addressLine2.trim() || undefined,
      stateProvince: address.stateProvince.trim() || undefined,
      idCardName,
    };
    setSaving(true);
    const res = await updateWelcomePackOrderShippingAdmin(order.id, input);
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Shipping details updated");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Edit shipping — ${order.developerName}`}
      size="lg"
    >
      <Stack gap="sm">
        <AddressFields
          values={address}
          onChange={(field, value) =>
            setAddress((prev) => ({ ...prev, [field]: value }))
          }
        />
        <TextInput
          label="ID card name"
          value={idCardName}
          onChange={(e) => setIdCardName(e.currentTarget.value)}
          maxLength={FIELD_LIMITS.idCardName}
          required
        />

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save shipping
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function EditTrackingModal({
  order,
  opened,
  onClose,
}: {
  order: AdminOrderRow;
  opened: boolean;
  onClose: () => void;
}) {
  const [trackingNumber, setTrackingNumber] = useState(
    order.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? "");
  const [notifyUser, setNotifyUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    const res = await updateWelcomePackOrderTrackingAdmin(
      order.id,
      trackingNumber,
      trackingUrl.trim() || undefined,
      notifyUser,
    );
    setSaving(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if (notifyUser && "emailSent" in res && !res.emailSent) {
      toast.warning(`Tracking updated, but the email was not sent`);
    } else {
      toast.success("Tracking updated");
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Edit tracking — ${order.developerName}`}
    >
      <Stack gap="sm">
        <TextInput
          label="Tracking number"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Tracking URL (optional)"
          placeholder="https://…"
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.currentTarget.value)}
        />
        <Checkbox
          label="Email the developer the new tracking details"
          checked={notifyUser}
          onChange={(e) => setNotifyUser(e.currentTarget.checked)}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save tracking
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
