"use client";

import { Alert, Group, Stack, Text, TextInput } from "@mantine/core";
import { FIELD_LIMITS } from "@/lib/welcome-pack-validation";
import IdCardPreview from "../IdCardPreview";
import type { OrderFormPack } from "../OrderForm";

export default function IdCardStep({
  pack,
  idCardName,
  onChange,
  error,
  onBlur,
}: {
  pack: OrderFormPack;
  idCardName: string;
  onChange: (value: string) => void;
  error: string | null;
  onBlur: () => void;
}) {
  return (
    <Stack gap="md">
      <Text c="dimmed">
        Type the name you&apos;d like printed on your ID card. The preview below
        uses the production card layout.
      </Text>
      <Group align="flex-start" wrap="wrap" gap="xl">
        <Stack gap="md" style={{ flex: 1, minWidth: 260 }}>
          <TextInput
            label="ID card name"
            name="idCardName"
            placeholder="As you'd like it printed"
            value={idCardName}
            onChange={(e) => onChange(e.currentTarget.value)}
            onBlur={onBlur}
            error={error}
            maxLength={FIELD_LIMITS.idCardName}
            autoComplete="name"
            required
            size="md"
          />
          <Alert color="blue" variant="light">
            Names appear exactly as typed (including capitalisation).
          </Alert>
        </Stack>
        <div style={{ flex: 1, minWidth: 280 }}>
          <IdCardPreview
            templateUrl={pack.idCardTemplateBlobUrl}
            templateWidth={pack.idCardWidth}
            templateHeight={pack.idCardHeight}
            nameX={pack.idCardNameX}
            nameY={pack.idCardNameY}
            fontSize={pack.idCardFontSize}
            fontColor={pack.idCardFontColor}
            fontFamily={pack.idCardFontFamily}
            nameMaxWidth={pack.idCardNameMaxWidth}
            nameMaxHeight={pack.idCardNameMaxHeight}
            nameAlign={pack.idCardNameAlign}
            nameWrapMode={pack.idCardNameWrapMode}
            name={idCardName}
            interactive
          />
        </div>
      </Group>
    </Stack>
  );
}
