"use client";

import {
  Box,
  Button,
  Card,
  Group,
  Radio,
  Select,
  Stack,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
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

  async function action(formData: FormData) {
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
            {/* 
              Mantine Select component requires a hidden input to sync with native FormData 
              because it's a custom UI component, not a native <select> by default unless we set name.
              Alternatively, we can use a hidden input ourselves to guarantee it's passed.
            */}
            <Select
              label="Preferred Payment Method"
              name="paymentMethod"
              value={paymentMethod}
              onChange={(val) => setPaymentMethod(val as string)}
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
              />
            )}

            {paymentMethod === "ROBUX" && (
              <TextInput
                label="Roblox Username"
                name="robuxUsername"
                defaultValue={profile.robuxUsername || ""}
                placeholder="Builderman"
                required
              />
            )}

            {paymentMethod === "DUITNOW" && (
              <Stack gap="sm">
                <Radio.Group
                  value={duitNowType}
                  onChange={(val) => setDuitNowType(val as "ID" | "BANK")}
                >
                  <Group mt="xs">
                    <Radio value="ID" label="Phone / NRIC ID" />
                    <Radio value="BANK" label="Bank Account" />
                  </Group>
                </Radio.Group>

                {duitNowType === "ID" ? (
                  <TextInput
                    label="DuitNow ID (Phone / NRIC)"
                    name="duitNowId"
                    defaultValue={profile.duitNowId || ""}
                    placeholder="Enter DuitNow ID"
                    required
                  />
                ) : (
                  <Box
                    pl="md"
                    style={{
                      borderLeft: "2px solid var(--mantine-color-blue-filled)",
                    }}
                  >
                    <Stack gap="sm">
                      <TextInput
                        label="Bank Name"
                        name="bankName"
                        defaultValue={profile.bankName || ""}
                        placeholder="Maybank, CIMB, etc."
                        required
                      />
                      <TextInput
                        label="Account Number"
                        name="bankAccountNumber"
                        defaultValue={profile.bankAccountNumber || ""}
                        placeholder="1234567890"
                        required
                      />
                      <TextInput
                        label="Account Holder Name"
                        name="bankAccountName"
                        defaultValue={
                          profile.bankAccountName || profile.legalName || ""
                        }
                        placeholder="John Doe"
                        required
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
                />
                <TextInput
                  label="Account Number / IBAN"
                  name="bankAccountNumber"
                  defaultValue={profile.bankAccountNumber || ""}
                  placeholder="Account info"
                  required
                />
                <TextInput
                  label="Account Holder Name"
                  name="bankAccountName"
                  defaultValue={
                    profile.bankAccountName || profile.legalName || ""
                  }
                  placeholder="John Doe"
                  required
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
