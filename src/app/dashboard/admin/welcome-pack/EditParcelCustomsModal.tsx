"use client";

import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
import { updateWelcomePackOrderParcelCustomsAdmin } from "./actions";
import type { AdminOrderRow, PackParcelDefaults } from "./OrdersTable";

function numberOrNull(v: number | string): number | null {
  if (v === "" || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function EditParcelCustomsModal({
  order,
  packDefaults,
  opened,
  onClose,
  onSaved,
}: {
  order: AdminOrderRow;
  packDefaults: PackParcelDefaults;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [weight, setWeight] = useState<number | string>(
    order.parcelWeightKg ?? "",
  );
  const [length, setLength] = useState<number | string>(
    order.parcelLengthCm ?? "",
  );
  const [width, setWidth] = useState<number | string>(
    order.parcelWidthCm ?? "",
  );
  const [height, setHeight] = useState<number | string>(
    order.parcelHeightCm ?? "",
  );
  const [residential, setResidential] = useState<string>(
    order.addressIsResidential === false ? "no" : "yes",
  );
  const [taxId, setTaxId] = useState(order.taxId ?? "");
  const [busy, setBusy] = useState(false);

  const isInternational = order.region === "INTERNATIONAL";
  const def = (v: number | null) => (v === null ? "—" : String(v));

  async function save() {
    setBusy(true);
    try {
      const res = await updateWelcomePackOrderParcelCustomsAdmin(order.id, {
        parcelWeightKg: numberOrNull(weight),
        parcelLengthCm: numberOrNull(length),
        parcelWidthCm: numberOrNull(width),
        parcelHeightCm: numberOrNull(height),
        addressIsResidential: residential === "yes",
        taxId: taxId.trim() || null,
      });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Parcel & customs updated");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit parcel & customs"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Leave a dimension blank to use the pack default. Addresses export as
          residential unless set to business; tax ID is optional.
        </Text>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <NumberInput
            label="Weight (kg)"
            placeholder={`Default ${def(packDefaults.weightKg)}`}
            value={weight}
            onChange={setWeight}
            min={0}
            step={0.1}
            decimalScale={3}
          />
          <NumberInput
            label="Length (cm)"
            placeholder={`Default ${def(packDefaults.lengthCm)}`}
            value={length}
            onChange={setLength}
            min={0}
          />
          <NumberInput
            label="Width (cm)"
            placeholder={`Default ${def(packDefaults.widthCm)}`}
            value={width}
            onChange={setWidth}
            min={0}
          />
          <NumberInput
            label="Height (cm)"
            placeholder={`Default ${def(packDefaults.heightCm)}`}
            value={height}
            onChange={setHeight}
            min={0}
          />
        </SimpleGrid>

        <Group grow align="flex-start">
          <Select
            label="Residential address?"
            description={
              isInternational
                ? "Defaults to residential for international customs"
                : "Defaults to residential"
            }
            data={[
              { value: "yes", label: "Yes - residential" },
              { value: "no", label: "No - business" },
            ]}
            value={residential}
            onChange={(v) => setResidential(v ?? "yes")}
          />
          <TextInput
            label="Receiver tax ID"
            description="Optional"
            placeholder="e.g. S1234567D"
            value={taxId}
            onChange={(e) => setTaxId(e.currentTarget.value)}
          />
        </Group>

        {order.exportIssues.length > 0 && (
          <Alert color="orange" title="Not yet export-ready">
            <Stack gap={2}>
              {order.exportIssues.map((issue) => (
                <Text key={issue} size="sm">
                  • {issue}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
