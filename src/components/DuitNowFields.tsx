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
 *
 * The proxy branch reads in the order the admin's bank asks for the same
 * facts — type, issuing country, number, then the app it is linked in — and
 * ends with the claim the developer has to make, inline, before Save works.
 * That claim used to live in a modal on Save. It sits here so the box can
 * name the exact ID and the exact app it is under, and so the app's own
 * "link it here" line appears the moment the app is chosen.
 */

import {
  Anchor,
  Badge,
  Box,
  Checkbox,
  Group,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { CircleCheck } from "lucide-react";
import { countryNameFromCode, countryOptions } from "@/lib/countries";
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
import { linkGuideFor } from "@/lib/duitnow-link-guide";
import {
  DUITNOW_INSTITUTIONS,
  getBankDisplayName,
  isBillplzSupported,
} from "@/lib/payment-validation";

type Props = {
  value: DuitNowValue;
  onChange: (patch: Partial<DuitNowValue>) => void;
  errors: Partial<Record<DuitNowFieldName, string>>;
  /** Which fields have been interacted with; errors stay quiet until then. */
  touched: Partial<Record<DuitNowFieldName, boolean>>;
  onBlur: (field: DuitNowFieldName) => void;
  /** The name the linked account has to be in; null until one is known. */
  legalName: string | null;
  /** Whether this value still needs the developer's two-box confirmation. */
  attest: boolean;
  /** When the stored value was last confirmed; shown while `attest` is off. */
  confirmedAt: Date | null;
  /** The developer wants to confirm an unchanged value again. */
  onReconfirm: () => void;
  /** Emit hidden inputs so a FormData-based <form> submits this state. */
  withHiddenInputs?: boolean;
};

export default function DuitNowFields({
  value,
  onChange,
  errors,
  touched,
  onBlur,
  legalName,
  attest,
  confirmedAt,
  onReconfirm,
  withHiddenInputs = false,
}: Props) {
  const errorFor = (field: DuitNowFieldName) =>
    touched[field] ? (errors[field] ?? null) : null;

  const spec = value.idType
    ? DUITNOW_ID_TYPES.find((entry) => entry.value === value.idType)
    : null;

  const pretty =
    value.idType && value.duitNowId && !errors.duitNowId
      ? formatDuitNowIdForDisplay(value.idType, value.duitNowId)
      : null;
  const countryName =
    value.idType === "PASSPORT" && value.idCountry
      ? countryNameFromCode(value.idCountry)
      : null;
  // What the admin will type into the bank, in the words the bank uses.
  const preview = pretty
    ? countryName
      ? `${spec?.label} ${pretty} · ${countryName}`
      : pretty
    : null;

  const institutionName = value.idInstitution
    ? getBankDisplayName(value.idInstitution)
    : null;
  const guide = linkGuideFor(value.idInstitution);

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
            description="Released by hand, and only works if you have linked the ID in your bank or e-wallet app."
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
            name="duitNowIdCountry"
            value={
              value.mode === "ID" && value.idType === "PASSPORT"
                ? (value.idCountry ?? "")
                : ""
            }
          />
          <input
            type="hidden"
            name="duitNowId"
            value={value.mode === "ID" ? value.duitNowId : ""}
          />
          <input
            type="hidden"
            name="duitNowIdInstitution"
            value={value.mode === "ID" ? (value.idInstitution ?? "") : ""}
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

            {/* Before the number, because that is the order the bank's own
                transfer screen asks — the admin copies these two in turn. */}
            {value.idType === "PASSPORT" && (
              <Select
                label="Issuing country"
                placeholder="Search for a country"
                data={countryOptions()}
                value={value.idCountry}
                onChange={(next) => onChange({ idCountry: next })}
                onBlur={() => onBlur("duitNowIdCountry")}
                searchable
                required
                error={errorFor("duitNowIdCountry")}
              />
            )}

            {value.idType && (
              <TextInput
                label={spec?.label ?? "DuitNow ID"}
                placeholder={spec?.placeholder}
                description={spec?.inputHint}
                value={value.duitNowId}
                required
                error={errorFor("duitNowId")}
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

            {value.idType && (
              <Stack gap={4}>
                <Select
                  label="Linked to"
                  placeholder="Search for the bank or e-wallet you linked it in"
                  data={DUITNOW_INSTITUTIONS}
                  value={value.idInstitution}
                  onChange={(next) => onChange({ idInstitution: next })}
                  onBlur={() => onBlur("duitNowIdInstitution")}
                  searchable
                  required
                  error={errorFor("duitNowIdInstitution")}
                />
                {guide && (
                  <Text size="xs" c="dimmed">
                    {guide.line}
                  </Text>
                )}
              </Stack>
            )}

            {/* The claim itself, under the app it is about. The boxes gate
                Save rather than sit beside it: an acknowledgement nobody has
                to touch is an acknowledgement nobody reads. Once this exact
                value has been confirmed they give way to the ✓ line, so the
                confirmation never becomes a reflex on unrelated saves. */}
            {institutionName &&
              (attest ? (
                <Stack gap="xs">
                  <Checkbox
                    checked={value.linked}
                    onChange={(event) => {
                      onChange({ linked: event.currentTarget.checked });
                      onBlur("duitNowLinked");
                    }}
                    label={
                      <>
                        I’ve linked <strong>{pretty ?? "this ID"}</strong> to my{" "}
                        {institutionName} account as a DuitNow ID
                      </>
                    }
                    description="If it isn’t linked, our bank finds nothing and your payout waits."
                    error={errorFor("duitNowLinked")}
                  />
                  <Checkbox
                    checked={value.ownName}
                    onChange={(event) => {
                      onChange({ ownName: event.currentTarget.checked });
                      onBlur("duitNowOwnName");
                    }}
                    label={
                      legalName ? (
                        <>
                          That account is in my name,{" "}
                          <strong>{legalName}</strong>
                        </>
                      ) : (
                        "That account is in my own name"
                      )
                    }
                    error={errorFor("duitNowOwnName")}
                  />
                </Stack>
              ) : (
                <Group gap={6} align="center">
                  <CircleCheck size={14} color="var(--mantine-color-teal-5)" />
                  <Text size="xs" c="dimmed">
                    Confirmed
                    {confirmedAt
                      ? ` ${confirmedAt.toLocaleDateString("en-MY")}`
                      : ""}{" "}
                    · linked at {institutionName}
                  </Text>
                  <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    onClick={onReconfirm}
                  >
                    Changed something? Re-confirm
                  </Anchor>
                </Group>
              ))}

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
    </Stack>
  );
}
