"use client";

import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { unlinkAccount } from "./account-actions";

type LinkedAccountsProps = {
  linkedAccounts: { providerId: string; accountId: string }[];
  linearEmail: string | null;
  paymentMethod: string;
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
}: LinkedAccountsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function getAccount(providerId: string) {
    return linkedAccounts.find((a) => a.providerId === providerId);
  }

  async function handleLink(providerId: string) {
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
    <Card withBorder radius="md" padding="xl">
      <Title order={3} mb="md">
        Linked Accounts
      </Title>
      <Stack gap="md">
        {PROVIDERS.map((provider) => {
          const account = getAccount(provider.id);
          const isLinear = provider.id === "linear";

          return (
            <Group key={provider.id} justify="space-between" wrap="nowrap">
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
                  onClick={() => handleLink(provider.id)}
                >
                  Link {provider.label}
                </Button>
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
