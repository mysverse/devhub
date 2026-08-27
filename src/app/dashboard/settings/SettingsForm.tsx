"use client";

import {
  Alert,
  Button,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StepTransition } from "@/components/animations";
import DuitNowFields from "@/components/DuitNowFields";
import FormSection from "@/components/FormSection";
import { duitNowIssueMessage } from "@/lib/duitnow-copy";
import {
  applyDuitNowPatch,
  DUITNOW_FIELD_NAMES,
  type DuitNowFieldName,
  type DuitNowValue,
  duitNowFieldErrors,
  initialDuitNowMode,
  needsDuitNowConfirmation,
} from "@/lib/duitnow-form";
import {
  type DuitNowIdType,
  isDuitNowConfirmationStale,
} from "@/lib/duitnow-id";
import type { IntegrationAvailability } from "@/lib/integration-availability";
import {
  getBankDisplayName,
  validateBankAccountName,
  validateBankAccountNumber,
  validateBankName,
} from "@/lib/payment-validation";
import { updateProfileSettings } from "./actions";

type ProfileProps = {
  profile: {
    preferredName: string | null;
    legalName: string | null;
    paymentMethod: string;
    paypalEmail: string | null;
    duitNowId: string | null;
    duitNowIdType: DuitNowIdType | null;
    duitNowIdStatus: string;
    duitNowIdCheckedAt: Date | null;
    duitNowIdIssue: string | null;
    duitNowIdCountry: string | null;
    duitNowIdInstitution: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    robuxUsername: string | null;
    shippingAddress: string | null;
  };
  robloxLinked: boolean;
  robuxPayoutAvailability: IntegrationAvailability;
};

export default function SettingsForm({
  profile,
  robloxLinked,
  robuxPayoutAvailability,
}: ProfileProps) {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(profile.paymentMethod);
  const [duitNow, setDuitNow] = useState<DuitNowValue>({
    mode: initialDuitNowMode(profile),
    idType: profile.duitNowIdType,
    idCountry: profile.duitNowIdCountry,
    duitNowId: profile.duitNowId ?? "",
    idInstitution: profile.duitNowIdInstitution,
    linked: false,
    ownName: false,
    bankName: profile.paymentMethod === "DUITNOW" ? profile.bankName : null,
    bankAccountNumber:
      profile.paymentMethod === "DUITNOW"
        ? (profile.bankAccountNumber ?? "")
        : "",
    bankAccountName:
      profile.paymentMethod === "DUITNOW"
        ? (profile.bankAccountName ?? "")
        : "",
  });
  const [duitNowTouched, setDuitNowTouched] = useState<
    Partial<Record<DuitNowFieldName, boolean>>
  >({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // An unchanged, already-confirmed ID shows a ✓ line instead of the boxes.
  // Bringing them back is the developer's call — the "Changed something?"
  // anchor — which is what makes the stale-confirmation banner actionable.
  const [reconfirm, setReconfirm] = useState(false);
  const attest = reconfirm || needsDuitNowConfirmation(duitNow, profile);
  const duitNowErrors = duitNowFieldErrors(duitNow, { attest });

  function setFieldError(field: string, error: string | null) {
    setErrors((prev) => ({ ...prev, [field]: error }));
  }

  function clearErrors() {
    setErrors({});
  }

  function validateAllFields(formData: FormData): boolean {
    const newErrors: Record<string, string | null> = {};

    if (paymentMethod === "PAYPAL") {
      const email = formData.get("paypalEmail") as string;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        newErrors.paypalEmail = "Please enter a valid email address";
      }
    }

    if (paymentMethod === "ROBUX") {
      if (!robuxPayoutAvailability.configured) {
        newErrors.robux =
          robuxPayoutAvailability.unavailableDescription ??
          "Robux payments are unavailable right now.";
      } else if (!robloxLinked) {
        newErrors.robux =
          "Link your Roblox account in the Linked Accounts section above first.";
      }
    }

    if (paymentMethod === "DUITNOW") {
      Object.assign(newErrors, duitNowFieldErrors(duitNow, { attest }));
      // Every DuitNow field is now controlled, so a blocked submit must reveal
      // the errors that were being held back until each field was touched.
      setDuitNowTouched(
        Object.fromEntries(DUITNOW_FIELD_NAMES.map((field) => [field, true])),
      );
    }

    if (paymentMethod === "BANK_TRANSFER") {
      newErrors.bankName = validateBankName(
        (formData.get("bankName") as string) || "",
      );
      newErrors.bankAccountNumber = validateBankAccountNumber(
        (formData.get("bankAccountNumber") as string) || "",
      );
      newErrors.bankAccountName = validateBankAccountName(
        (formData.get("bankAccountName") as string) || "",
      );
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  }

  async function action(formData: FormData) {
    if (!validateAllFields(formData)) return;

    setLoading(true);

    const res = await updateProfileSettings(formData);

    if (res?.error) {
      toast.error(res.error);
    } else if (res?.success) {
      toast.success("Settings updated successfully!");
      // The re-confirmation was for the value just saved, not the next edit.
      setReconfirm(false);
    }

    setLoading(false);
  }

  return (
    <form action={action} style={{ maxWidth: "42rem" }}>
      <Stack gap="xl">
        <FormSection title="Personal Information">
          <TextInput
            label="Display Name"
            name="preferredName"
            defaultValue={profile.preferredName || ""}
            placeholder="Alex"
            description="How you appear to everyone on DevHub — dashboards, notifications and emails. Leave blank to use your sign-in name."
          />
          <TextInput
            label="Legal Name"
            name="legalName"
            defaultValue={profile.legalName || ""}
            placeholder="John Doe"
            description="Only used for payouts, KYC, signed documents and parcel labels. Never shown to other developers — they see your display name."
          />
          <Textarea
            label="Shipping Address (for Merch)"
            name="shippingAddress"
            defaultValue={profile.shippingAddress || ""}
            placeholder="123 Developer Lane..."
            rows={3}
          />
        </FormSection>

        {/* A payout an admin has already found unpayable has to look like a
            fault, not like a settings hint — this is the one screen that can
            fix it. Same doctrine as SectionUnavailable. */}
        {profile.duitNowIdStatus === "UNREACHABLE" && (
          <Alert
            color="red"
            variant="light"
            icon={<TriangleAlert size={16} />}
            title="We could not find your DuitNow ID"
          >
            <Stack gap="xs">
              <Text size="sm">
                {duitNowIssueMessage(profile.duitNowIdIssue, {
                  institutionName: getBankDisplayName(
                    profile.duitNowIdInstitution,
                  ),
                })}
              </Text>
              <Text size="sm">
                Once it is linked, save it again below and confirm — or switch
                to a bank account number, which is always reachable.
              </Text>
            </Stack>
          </Alert>
        )}

        {profile.duitNowIdStatus !== "UNREACHABLE" &&
          isDuitNowConfirmationStale(profile.duitNowIdCheckedAt) && (
            <Alert
              color="yellow"
              variant="light"
              icon={<TriangleAlert size={16} />}
            >
              You last confirmed your payment details on{" "}
              {profile.duitNowIdCheckedAt?.toLocaleDateString("en-MY")}. If
              anything has changed, update it before your next payout.
            </Alert>
          )}

        <FormSection title="Payment Preferences" gap="lg">
          <Select
            label="Preferred Payment Method"
            name="paymentMethod"
            value={paymentMethod}
            onChange={(val) => {
              if (!val) return;
              if (val === "ROBUX" && !robuxPayoutAvailability.configured) {
                toast.error(
                  robuxPayoutAvailability.unavailableDescription ??
                    "Robux payments are unavailable right now.",
                );
                return;
              }
              setPaymentMethod(val as string);
              clearErrors();
            }}
            data={[
              // PayPal has no auto-payout path in src/lib/payout.ts, and it is
              // the schema default — so a developer who never opens this page
              // is silently on the manual-release track. Say so at the point
              // of choice rather than letting them discover it while waiting.
              { value: "PAYPAL", label: "PayPal (released manually)" },
              {
                value: "ROBUX",
                label: robuxPayoutAvailability.configured
                  ? "Robux (paid automatically)"
                  : "Robux (unavailable)",
                disabled: !robuxPayoutAvailability.configured,
              },
              { value: "DUITNOW", label: "DuitNow (paid automatically)" },
              {
                value: "BANK_TRANSFER",
                label: "International Bank Transfer",
              },
            ]}
          />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />

          {!robuxPayoutAvailability.configured && (
            <Alert
              color="yellow"
              title={robuxPayoutAvailability.unavailableTitle}
            >
              {robuxPayoutAvailability.unavailableDescription}
            </Alert>
          )}

          {paymentMethod === "PAYPAL" && (
            <Alert color="gray" variant="light" title="Released by hand">
              PayPal payouts wait for an admin to send them. DuitNow and Robux
              can go out automatically once your weekly limit and verification
              allow it — worth switching if you&rsquo;d rather not wait.
            </Alert>
          )}

          <StepTransition step={paymentMethod} minHeight={64}>
            {paymentMethod === "PAYPAL" && (
              <TextInput
                label="PayPal Email"
                name="paypalEmail"
                type="email"
                defaultValue={profile.paypalEmail || ""}
                placeholder="paypal@example.com"
                required
                error={errors.paypalEmail}
                onBlur={(e) => {
                  const val = e.currentTarget.value;
                  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                    setFieldError(
                      "paypalEmail",
                      "Please enter a valid email address",
                    );
                  } else {
                    setFieldError("paypalEmail", null);
                  }
                }}
              />
            )}

            {paymentMethod === "ROBUX" &&
              (!robuxPayoutAvailability.configured ? (
                <Alert color="yellow" title="Robux payments unavailable">
                  {errors.robux ??
                    robuxPayoutAvailability.unavailableDescription}
                </Alert>
              ) : robloxLinked ? (
                <Alert color="green" title="Roblox account linked">
                  Robux payments will be sent to your linked Roblox account.
                </Alert>
              ) : (
                <Alert color="yellow" title="Roblox account required">
                  Link your Roblox account in the Linked Accounts section above
                  before selecting Robux as your payment method.
                </Alert>
              ))}

            {paymentMethod === "DUITNOW" && (
              <DuitNowFields
                value={duitNow}
                onChange={(patch) =>
                  setDuitNow((prev) => applyDuitNowPatch(prev, patch))
                }
                errors={duitNowErrors}
                touched={duitNowTouched}
                onBlur={(field) =>
                  setDuitNowTouched((prev) => ({ ...prev, [field]: true }))
                }
                legalName={profile.legalName}
                attest={attest}
                confirmedAt={profile.duitNowIdCheckedAt}
                onReconfirm={() => setReconfirm(true)}
                withHiddenInputs
              />
            )}

            {paymentMethod === "BANK_TRANSFER" && (
              <Stack gap="sm">
                <TextInput
                  label="Bank Name"
                  name="bankName"
                  defaultValue={profile.bankName || ""}
                  placeholder="Chase, Bank of America, etc."
                  required
                  error={errors.bankName}
                  onBlur={(e) =>
                    setFieldError(
                      "bankName",
                      validateBankName(e.currentTarget.value),
                    )
                  }
                />
                <TextInput
                  label="Account Number / IBAN"
                  name="bankAccountNumber"
                  defaultValue={profile.bankAccountNumber || ""}
                  placeholder="Account info"
                  required
                  error={errors.bankAccountNumber}
                  onBlur={(e) =>
                    setFieldError(
                      "bankAccountNumber",
                      validateBankAccountNumber(e.currentTarget.value),
                    )
                  }
                />
                <TextInput
                  label="Account Holder Name"
                  name="bankAccountName"
                  defaultValue={
                    profile.bankAccountName || profile.legalName || ""
                  }
                  placeholder="John Doe"
                  required
                  error={errors.bankAccountName}
                  onBlur={(e) =>
                    setFieldError(
                      "bankAccountName",
                      validateBankAccountName(e.currentTarget.value),
                    )
                  }
                />
              </Stack>
            )}
          </StepTransition>
        </FormSection>

        {/* Read by updateProfileSettings; "true" only when the form was
            asking and both boxes are ticked for the value being saved. An
            unchanged, already-confirmed ID sends nothing, so an unrelated
            save cannot silently re-confirm it. */}
        <input
          type="hidden"
          name="duitNowConfirmed"
          value={attest && duitNow.linked && duitNow.ownName ? "true" : "false"}
        />

        <Button type="submit" loading={loading}>
          Save Settings
        </Button>
      </Stack>
    </form>
  );
}
