"use client";

import {
  Box,
  Button,
  Card,
  Group,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
import {
  DUITNOW_INSTITUTIONS,
  normalizeMalaysianPhone,
  validateBankAccountName,
  validateBankAccountNumber,
  validateBankName,
  validateDuitNowBankName,
  validateDuitNowId,
  validateRobuxUsername,
} from "@/lib/payment-validation";
import { updateProfileSettings } from "./actions";

type ProfileProps = {
  profile: {
    legalName: string | null;
    paymentMethod: string;
    paypalEmail: string | null;
    duitNowId: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    robuxUsername: string | null;
    shippingAddress: string | null;
  };
};

export default function SettingsForm({ profile }: ProfileProps) {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(profile.paymentMethod);
  const [duitNowType, setDuitNowType] = useState<"ID" | "BANK">(
    profile.bankAccountNumber || profile.paymentMethod === "BANK_TRANSFER"
      ? "BANK"
      : "ID",
  );
  const [duitNowBankName, setDuitNowBankName] = useState<string | null>(
    profile.paymentMethod === "DUITNOW" ? profile.bankName : null,
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});

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
      newErrors.robuxUsername = validateRobuxUsername(
        (formData.get("robuxUsername") as string) || "",
      );
    }

    if (paymentMethod === "DUITNOW") {
      if (duitNowType === "ID") {
        newErrors.duitNowId = validateDuitNowId(
          (formData.get("duitNowId") as string) || "",
        );
      } else {
        newErrors.bankName = validateDuitNowBankName(duitNowBankName || "");
        newErrors.bankAccountNumber = validateBankAccountNumber(
          (formData.get("bankAccountNumber") as string) || "",
        );
        newErrors.bankAccountName = validateBankAccountName(
          (formData.get("bankAccountName") as string) || "",
        );
      }
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
    }

    setLoading(false);
  }

  return (
    <form action={action} style={{ maxWidth: "42rem" }}>
      <Stack gap="xl">
        <Card withBorder radius="md" padding="xl">
          <Title order={3} mb="md">
            Personal Information
          </Title>
          <Stack gap="md">
            <TextInput
              label="Legal Name"
              name="legalName"
              defaultValue={profile.legalName || ""}
              placeholder="John Doe"
              description="This is kept private and only visible to authorised administrators for payment and compliance purposes."
            />
            <Textarea
              label="Shipping Address (for Merch)"
              name="shippingAddress"
              defaultValue={profile.shippingAddress || ""}
              placeholder="123 Developer Lane..."
              rows={3}
            />
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="xl">
          <Title order={3} mb="md">
            Payment Preferences
          </Title>
          <Stack gap="lg">
            <Select
              label="Preferred Payment Method"
              name="paymentMethod"
              value={paymentMethod}
              onChange={(val) => {
                setPaymentMethod(val as string);
                clearErrors();
              }}
              data={[
                { value: "PAYPAL", label: "PayPal" },
                { value: "ROBUX", label: "Robux" },
                { value: "DUITNOW", label: "DuitNow" },
                { value: "BANK_TRANSFER", label: "Bank Transfer" },
              ]}
            />
            <input type="hidden" name="paymentMethod" value={paymentMethod} />

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

            {paymentMethod === "ROBUX" && (
              <TextInput
                label="Roblox Username"
                name="robuxUsername"
                defaultValue={profile.robuxUsername || ""}
                placeholder="Builderman"
                required
                error={errors.robuxUsername}
                onBlur={(e) =>
                  setFieldError(
                    "robuxUsername",
                    validateRobuxUsername(e.currentTarget.value),
                  )
                }
              />
            )}

            {paymentMethod === "DUITNOW" && (
              <Stack gap="sm">
                <RadioGroup
                  value={duitNowType}
                  onChange={(val) => {
                    setDuitNowType(val as "ID" | "BANK");
                    clearErrors();
                  }}
                >
                  <Group mt="xs">
                    <Radio value="ID" label="Phone / NRIC ID" />
                    <Radio value="BANK" label="Bank Account" />
                  </Group>
                </RadioGroup>
                <input type="hidden" name="duitNowType" value={duitNowType} />

                {duitNowType === "ID" ? (
                  <TextInput
                    label="DuitNow ID (Phone / NRIC)"
                    name="duitNowId"
                    defaultValue={profile.duitNowId || ""}
                    placeholder="e.g. +60123456789 or 990101141234"
                    description="Malaysian phone number (+60XXXXXXXXX) or NRIC (12 digits)"
                    required
                    error={errors.duitNowId}
                    onBlur={(e) => {
                      const val = e.currentTarget.value;
                      const normalized = normalizeMalaysianPhone(val);
                      if (normalized !== val) {
                        e.currentTarget.value = normalized;
                      }
                      setFieldError("duitNowId", validateDuitNowId(normalized));
                    }}
                  />
                ) : (
                  <Box
                    pl="md"
                    style={{
                      borderLeft: "2px solid var(--mantine-color-blue-filled)",
                    }}
                  >
                    <Stack gap="sm">
                      <Select
                        label="Bank / eWallet"
                        name="bankName"
                        data={DUITNOW_INSTITUTIONS}
                        value={duitNowBankName}
                        onChange={(val) => {
                          setDuitNowBankName(val);
                          setFieldError("bankName", null);
                        }}
                        placeholder="Search for your bank or eWallet"
                        searchable
                        required
                        error={errors.bankName}
                      />
                      <TextInput
                        label="Account Number"
                        name="bankAccountNumber"
                        defaultValue={profile.bankAccountNumber || ""}
                        placeholder="1234567890"
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
                  </Box>
                )}
              </Stack>
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
          </Stack>
        </Card>

        <Button type="submit" loading={loading}>
          Save Settings
        </Button>
      </Stack>
    </form>
  );
}
