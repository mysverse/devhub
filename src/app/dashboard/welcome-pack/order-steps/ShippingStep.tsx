"use client";

import { Alert, Stack, Text, Textarea } from "@mantine/core";
import {
  FIELD_LIMITS,
  type OrderFieldName,
} from "@/lib/welcome-pack-validation";
import AddressFields from "../AddressFields";
import type { OrderDraft } from "../useOrderDraft";

export default function ShippingStep({
  draft,
  setField,
  profileShippingAddress,
  errorFor,
  onBlur,
}: {
  draft: OrderDraft;
  setField: <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) => void;
  /** Free-text address from the user's profile, shown as a copy reference. */
  profileShippingAddress: string | null;
  errorFor: (name: OrderFieldName) => string | null;
  onBlur: (name: OrderFieldName) => void;
}) {
  return (
    <Stack gap="md">
      <AddressFields
        values={draft}
        // OrderDraft extends AddressValues, but TS can't distribute the
        // generic indexed access across the intersection — hence the cast.
        onChange={(field, value) =>
          setField(field, value as OrderDraft[typeof field])
        }
        errorFor={errorFor}
        onBlur={onBlur}
        afterRegion={
          profileShippingAddress ? (
            <Alert
              color="gray"
              variant="light"
              title="Address saved on your profile"
            >
              <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                {profileShippingAddress}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Copy the details into the fields below — packs ship to this
                structured address.
              </Text>
            </Alert>
          ) : undefined
        }
      />

      <Textarea
        label="Notes (optional)"
        name="notes"
        description="Anything we should know — building access, recipient quirks, etc."
        value={draft.notes}
        onChange={(e) => setField("notes", e.currentTarget.value)}
        onBlur={() => onBlur("notes")}
        error={errorFor("notes")}
        maxLength={FIELD_LIMITS.notes}
        autosize
        minRows={2}
        maxRows={5}
      />
    </Stack>
  );
}
