"use client";

/**
 * The DuitNow payment-details fields, shared by HR Settings and onboarding.
 *
 * It exists because the two forms disagreed. Settings validated the DuitNow ID
 * inline; onboarding checked only that it was non-empty and surfaced the
 * server's first Zod message as a bare toast — and onboarding is where every
 * first-time ID is entered. One component means one set of rules and one set
 * of words at both ends.
 *
 * Fully controlled, because the two hosts are structurally different: Settings
 * is a native <form> read through FormData, onboarding submits a JSON object
 * from React state. `withHiddenInputs` mirrors the controlled state back into
 * the form payload for the former, the way SettingsForm already does for
 * paymentMethod.
 */

import {
  Alert,
  Badge,
  Box,
  Group,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import type {
  DuitNowFieldName,
  DuitNowMode,
  DuitNowValue,
} from "@/lib/duitnow-form";
import {
  DUITNOW_ID_TYPES,
  formatDuitNowIdForDisplay,
  isDuitNowIdType,
  normalizeDuitNowId,
} from "@/lib/duitnow-id";
import {
  DUITNOW_INSTITUTIONS,
  isBillplzSupported,
} from "@/lib/payment-validation";

type Props = {
  value: DuitNowValue;
  onChange: (patch: Partial<DuitNowValue>) => void;
  errors: Partial<Record<DuitNowFieldName, string>>;
  /** Which fields have been interacted with; errors stay quiet until then. */
  touched: Partial<Record<DuitNowFieldName, boolean>>;
  onBlur: (field: DuitNowFieldName) => void;
  /** Emit hidden inputs so a FormData-based <form> submits this state. */
  withHiddenInputs?: boolean;
};

export default function DuitNowFields({
  value,
  onChange,
  errors,
  touched,
  onBlur,
  withHiddenInputs = false,
}: Props) {
  const errorFor = (field: DuitNowFieldName) =>
    touched[field] ? (errors[field] ?? null) : null;

  const spec = value.idType
    ? DUITNOW_ID_TYPES.find((entry) => entry.value === value.idType)
    : null;

  const preview =
    value.idType && value.duitNowId && !errors.duitNowId
      ? formatDuitNowIdForDisplay(value.idType, value.duitNowId)
      : null;

  return (
    <Stack gap="sm">
      <RadioGroup
        value={value.mode}
        onChange={(next) => onChange({ mode: next as DuitNowMode })}
        label="How should we send it?"
      >
        <Stack gap="xs" mt="xs">
          <Radio
            value="BANK"
            label={
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">Bank account number</Text>
                <Badge size="xs" variant="light" color="teal">
                  Recommended
                </Badge>
              </Group>
            }
            description="Always reachable, and the only DuitNow route that can pay out automatically."
          />
          <Radio
            value="ID"
            label="DuitNow ID (mobile, NRIC, passport…)"
            description="Released by hand, and only works if you have registered the ID."
          />
        </Stack>
      </RadioGroup>

      {withHiddenInputs && (
        <>
          <input type="hidden" name="duitNowType" value={value.mode} />
          <input
            type="hidden"
            name="duitNowIdType"
            value={value.mode === "ID" ? (value.idType ?? "") : ""}
          />
          <input
            type="hidden"
            name="duitNowId"
            value={value.mode === "ID" ? value.duitNowId : ""}
          />
          <input
            type="hidden"
            name="bankName"
            value={value.mode === "BANK" ? (value.bankName ?? "") : ""}
          />
          <input
            type="hidden"
            name="bankAccountNumber"
            value={value.mode === "BANK" ? value.bankAccountNumber : ""}
          />
          <input
            type="hidden"
            name="bankAccountName"
            value={value.mode === "BANK" ? value.bankAccountName : ""}
          />
        </>
      )}

      {value.mode === "ID" ? (
        <Box
          pl="md"
          style={{ borderLeft: "2px solid var(--mantine-color-blue-filled)" }}
        >
          <Stack gap="sm">
            <RadioGroup
              value={value.idType ?? ""}
              onChange={(next) =>
                onChange(
                  isDuitNowIdType(next) ? { idType: next, duitNowId: "" } : {},
                )
              }
              label="What kind of DuitNow ID?"
              description="Pick the same one your bank shows when it asks how to transfer."
              error={errorFor("duitNowIdType")}
            >
              {/* A Stack, not a Group: five options with labels this long wrap
                  badly at 390px, and the visual check only screenshots. */}
              <Stack gap="xs" mt="xs">
                {DUITNOW_ID_TYPES.map((entry) => (
                  <Radio
                    key={entry.value}
                    value={entry.value}
                    label={entry.label}
                    description={entry.hint}
                  />
                ))}
              </Stack>
            </RadioGroup>

            {value.idType && (
              <TextInput
                label={spec?.label ?? "DuitNow ID"}
                placeholder={spec?.placeholder}
                value={value.duitNowId}
                required
                error={errorFor("duitNowId")}
                description="Registering this ID is a separate step in your banking or e-wallet app. Having the number on file with them is not the same thing — and they will not tell you if registration failed."
                onChange={(event) =>
                  onChange({ duitNowId: event.currentTarget.value })
                }
                onBlur={(event) => {
                  const idType = value.idType;
                  if (idType) {
                    const normalized = normalizeDuitNowId(
                      idType,
                      event.currentTarget.value,
                    );
                    if (normalized !== event.currentTarget.value) {
                      onChange({ duitNowId: normalized });
                    }
                  }
                  onBlur("duitNowId");
                }}
              />
            )}

            {preview && (
              <Text size="xs" c="dimmed">
                We will look for <strong>{preview}</strong> at our bank.
              </Text>
            )}
          </Stack>
        </Box>
      ) : (
        <Box
          pl="md"
          style={{ borderLeft: "2px solid var(--mantine-color-blue-filled)" }}
        >
          <Stack gap="sm">
            <Select
              label="Bank / eWallet"
              data={DUITNOW_INSTITUTIONS}
              value={value.bankName}
              onChange={(next) => onChange({ bankName: next })}
              onBlur={() => onBlur("bankName")}
              placeholder="Search for your bank or eWallet"
              searchable
              required
              error={errorFor("bankName")}
              renderOption={({ option }) => (
                <Group gap="xs" justify="space-between" wrap="nowrap" w="100%">
                  <Text size="sm">{option.label}</Text>
                  {isBillplzSupported(option.value) && (
                    <Badge
                      size="xs"
                      variant="light"
                      color="teal"
                      style={{ flexShrink: 0 }}
                    >
                      Auto payout
                    </Badge>
                  )}
                </Group>
              )}
            />
            {value.bankName && (
              <Text
                size="xs"
                c={isBillplzSupported(value.bankName) ? "teal" : "dimmed"}
              >
                {isBillplzSupported(value.bankName)
                  ? "Automated payouts supported via Billplz"
                  : "Manual payouts only"}
              </Text>
            )}
            <TextInput
              label="Account Number"
              placeholder="1234567890"
              value={value.bankAccountNumber}
              required
              error={errorFor("bankAccountNumber")}
              onChange={(event) =>
                onChange({ bankAccountNumber: event.currentTarget.value })
              }
              onBlur={() => onBlur("bankAccountNumber")}
            />
            <TextInput
              label="Account Holder Name"
              placeholder="John Doe"
              value={value.bankAccountName}
              required
              error={errorFor("bankAccountName")}
              onChange={(event) =>
                onChange({ bankAccountName: event.currentTarget.value })
              }
              onBlur={() => onBlur("bankAccountName")}
            />
          </Stack>
        </Box>
      )}

      {value.mode === "ID" && (
        <Alert
          variant="light"
          color="yellow"
          icon={<TriangleAlert size={16} />}
        >
          We pay DuitNow IDs by searching for them in our bank. An ID that was
          never registered simply does not come up, and the payout waits.
        </Alert>
      )}
    </Stack>
  );
}
