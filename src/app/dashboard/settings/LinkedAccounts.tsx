"use client";

import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
import FormSection from "@/components/FormSection";
import { signIn } from "@/lib/auth-client";
import type { SetupIntegrationAvailability } from "@/lib/integration-availability";
import { unlinkAccount } from "./account-actions";

type ProviderId = "linear" | "discord" | "roblox";

type LinkedAccountsProps = {
  linkedAccounts: { providerId: string; accountId: string }[];
  linearEmail: string | null;
  paymentMethod: string;
  integrationAvailability: SetupIntegrationAvailability;
};

const PROVIDERS = [
  { id: "linear", label: "Linear", color: "violet" },
  { id: "discord", label: "Discord", color: "indigo" },
  { id: "roblox", label: "Roblox", color: "red" },
] as const;

export default function LinkedAccounts({
  linkedAccounts,
  linearEmail,
  paymentMethod,
  integrationAvailability,
}: LinkedAccountsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function getAccount(providerId: string) {
    return linkedAccounts.find((a) => a.providerId === providerId);
  }

  async function handleLink(providerId: ProviderId) {
    const availability = integrationAvailability[providerId];
    if (!availability.configured) {
      toast.error(
        availability.unavailableDescription ??
          `${availability.label} linking is unavailable.`,
      );
      return;
    }

    setLoading(providerId);
    await signIn.oauth2({
      providerId,
      callbackURL: "/dashboard/settings",
    });
  }

  async function handleUnlink(providerId: "discord" | "roblox") {
    setLoading(providerId);
    const res = await unlinkAccount(providerId);
    if (res?.error) {
      toast.error(res.error);
    } else {
      toast.success(
        `${providerId === "discord" ? "Discord" : "Roblox"} account disconnected.`,
      );
    }
    setLoading(null);
  }

  return (
    <FormSection title="Linked Accounts">
      {PROVIDERS.some(
        (provider) =>
          !getAccount(provider.id) &&
          !integrationAvailability[provider.id].configured,
      ) && (
        <Alert color="yellow" title="Some account links are unavailable">
          One or more integrations are missing server configuration, so their
          setup buttons are disabled for now.
        </Alert>
      )}

      {PROVIDERS.map((provider) => {
        const account = getAccount(provider.id);
        const isLinear = provider.id === "linear";
        const availability = integrationAvailability[provider.id];
        const unavailable = !account && !availability.configured;

        return (
          <Stack key={provider.id} gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm">
                <Text fw={600} size="sm">
                  {provider.label}
                </Text>
                {account ? (
                  <Badge color={provider.color} variant="light" size="sm">
                    {isLinear && linearEmail
                      ? linearEmail
                      : `ID: ${account.accountId}`}
                  </Badge>
                ) : unavailable ? (
                  <Badge color="yellow" variant="light" size="sm">
                    Unavailable
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light" size="sm">
                    Not linked
                  </Badge>
                )}
              </Group>

              {isLinear ? (
                account && (
                  <Text size="xs" c="dimmed">
                    Primary auth
                  </Text>
                )
              ) : account ? (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  loading={loading === provider.id}
                  disabled={
                    provider.id === "roblox" && paymentMethod === "ROBUX"
                  }
                  onClick={() =>
                    handleUnlink(provider.id as "discord" | "roblox")
                  }
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="light"
                  color={provider.color}
                  loading={loading === provider.id}
                  disabled={unavailable}
                  onClick={() => handleLink(provider.id)}
                >
                  Link {provider.label}
                </Button>
              )}
            </Group>

            {unavailable && (
              <Text size="xs" c="dimmed">
                {availability.unavailableDescription}
              </Text>
            )}
          </Stack>
        );
      })}
    </FormSection>
  );
}
