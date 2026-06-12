"use client";

import {
  Group,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from "@mantine/core";
import type { ShippingRegion } from "@prisma/client";
import { countryOptions } from "@/lib/countries";
import { FIELD_LIMITS } from "@/lib/welcome-pack-validation";

export type AddressValues = {
  region: ShippingRegion;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};

export type AddressFieldName = keyof AddressValues;

const noop = () => null;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" tt="uppercase" fw={600} c="dimmed" mt={4}>
      {children}
    </Text>
  );
}

/**
 * The region + recipient + address field set shared by the order wizard's
 * shipping step and the user/admin edit modals, so labels, limits and the
 * DOMESTIC→MY coupling can't drift apart. Validation display is optional —
 * modals lean on server-side validation instead.
 */
export default function AddressFields({
  values,
  onChange,
  errorFor = noop,
  onBlur,
  afterRegion,
}: {
  values: AddressValues;
  onChange: <K extends AddressFieldName>(
    field: K,
    value: AddressValues[K],
  ) => void;
  /** Inline error per field (wizard); omit to rely on server validation. */
  errorFor?: (name: AddressFieldName) => string | null;
  onBlur?: (name: AddressFieldName) => void;
  /** Rendered between the region picker and the recipient fields. */
  afterRegion?: React.ReactNode;
}) {
  return (
    <>
      <RadioGroup
        label="Shipping region"
        value={values.region}
        onChange={(v) => {
          const next = v as ShippingRegion;
          onChange("region", next);
          if (next === "DOMESTIC") onChange("country", "MY");
        }}
        error={errorFor("region")}
      >
        <Group gap="md" mt={6}>
          <Radio value="DOMESTIC" label="Malaysia (Domestic)" />
          <Radio value="INTERNATIONAL" label="International" />
        </Group>
      </RadioGroup>

      {afterRegion}

      <SectionLabel>Recipient</SectionLabel>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="Recipient name"
          name="recipientName"
          value={values.recipientName}
          onChange={(e) => onChange("recipientName", e.currentTarget.value)}
          onBlur={() => onBlur?.("recipientName")}
          error={errorFor("recipientName")}
          maxLength={FIELD_LIMITS.recipientName}
          autoComplete="name"
          required
        />
        <TextInput
          label="Phone"
          name="phone"
          value={values.phone}
          onChange={(e) => onChange("phone", e.currentTarget.value)}
          onBlur={() => onBlur?.("phone")}
          error={errorFor("phone")}
          maxLength={FIELD_LIMITS.phone}
          autoComplete="tel"
          inputMode="tel"
          required
        />
      </SimpleGrid>

      <SectionLabel>Address</SectionLabel>
      <TextInput
        label="Address line 1"
        name="addressLine1"
        value={values.addressLine1}
        onChange={(e) => onChange("addressLine1", e.currentTarget.value)}
        onBlur={() => onBlur?.("addressLine1")}
        error={errorFor("addressLine1")}
        maxLength={FIELD_LIMITS.addressLine}
        autoComplete="address-line1"
        required
      />
      <TextInput
        label="Address line 2"
        name="addressLine2"
        value={values.addressLine2}
        onChange={(e) => onChange("addressLine2", e.currentTarget.value)}
        onBlur={() => onBlur?.("addressLine2")}
        error={errorFor("addressLine2")}
        maxLength={FIELD_LIMITS.addressLine}
        autoComplete="address-line2"
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="City"
          name="city"
          value={values.city}
          onChange={(e) => onChange("city", e.currentTarget.value)}
          onBlur={() => onBlur?.("city")}
          error={errorFor("city")}
          maxLength={FIELD_LIMITS.city}
          autoComplete="address-level2"
          required
        />
        <TextInput
          label="State / Province"
          name="stateProvince"
          value={values.stateProvince}
          onChange={(e) => onChange("stateProvince", e.currentTarget.value)}
          onBlur={() => onBlur?.("stateProvince")}
          error={errorFor("stateProvince")}
          maxLength={FIELD_LIMITS.stateProvince}
          autoComplete="address-level1"
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="Postal code"
          name="postalCode"
          value={values.postalCode}
          onChange={(e) => onChange("postalCode", e.currentTarget.value)}
          onBlur={() => onBlur?.("postalCode")}
          error={errorFor("postalCode")}
          maxLength={FIELD_LIMITS.postalCode}
          autoComplete="postal-code"
          required
        />
        {values.region === "DOMESTIC" ? (
          <TextInput label="Country" value="Malaysia" disabled />
        ) : (
          <Select
            label="Country"
            name="country"
            data={countryOptions({ exclude: ["MY"] })}
            value={values.country || null}
            onChange={(v) => onChange("country", v ?? "")}
            error={errorFor("country")}
            autoComplete="country"
            searchable
            required
          />
        )}
      </SimpleGrid>
    </>
  );
}
