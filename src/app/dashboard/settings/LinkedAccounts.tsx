"use client";

import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormSection from "@/components/FormSection";
import { oauth2 } from "@/lib/auth-client";
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

/**
 * better-auth redirects OAuth callback failures to `errorCallbackURL` with a
 * machine-readable `?error=` code. Without this the user completes the consent
 * screen, gets bounced back, and sees nothing at all.
 */
const LINK_ERROR_MESSAGES: Record<string, string> = {
  account_already_linked_to_different_user:
    "That account is already linked to a different DevHub user. Ask an admin to detach it, then try again.",
  email_doesn_t_match: "That account's email doesn't match this DevHub user.",
  unable_to_link_account: "We couldn't link that account. Please try again.",
  oauth_code_verification_failed:
    "The sign-in with that provider expired. Please try again.",
  email_is_missing: "That provider didn't return enough profile information.",
  please_restart_the_process:
    "The link request expired. Please start it from this page again.",
};

function describeLinkError(code: string) {
  return (
    LINK_ERROR_MESSAGES[code] ??
    `Linking failed (${code.replace(/_/g, " ")}). Please try again.`
  );
}

export default function LinkedAccounts({
  linkedAccounts,
  linearEmail,
  paymentMethod,
  integrationAvailability,
}: LinkedAccountsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  // Surface a failed OAuth callback, then strip the param so a refresh doesn't
  // replay the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;
    toast.error(describeLinkError(error));
    params.delete("error");
    params.delete("error_description");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);

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
    // Use the dedicated account-linking endpoint, not signIn.oauth2 — the
    // user already has a session here. signIn.oauth2 doesn't know to attach
    // the new provider to it, so it falls through to creating a brand new
    // (unonboarded) user and switches the session to that instead.
    const result = await oauth2.link({
      providerId,
      callbackURL: "/dashboard/settings",
      errorCallbackURL: "/dashboard/settings",
    });
    // On success the client redirects away and this never runs. Anything else
    // (notably a 401 once the session has expired) resolves without navigating,
    // so clear the spinner and say something instead of hanging forever.
    if (result?.error) {
      toast.error(
        result.error.message ??
          `Couldn't start ${availability.label} linking. Please reload and try again.`,
      );
      setLoading(null);
    }
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
