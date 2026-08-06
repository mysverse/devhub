"use client";

import { Badge, Divider, Group, Stack, Switch, Text } from "@mantine/core";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import FormSection from "@/components/FormSection";
import {
  channelsForEntry,
  NOTIFICATION_CATALOG,
  type NotificationCatalogEntry,
  type NotificationChannelKey,
} from "@/lib/notifications/catalog";
import { updateNotificationPreference } from "./actions";

// Mirrors the catalog rather than restating it, so a new channel can't be
// added there and quietly missed here.
type Channel = NotificationChannelKey;

type Preference = {
  domain: string;
  type: string;
  channel: string;
  enabled: boolean;
};

const DOMAIN_TITLES: Record<string, string> = {
  ppt: "PPT payouts",
  payment: "Payments",
  bonus: "Bonuses",
  incentive: "Incentives",
  kyc: "Identity verification",
  ppt_request: "PPT requests",
  ppt_task: "PPT tasks & fairness",
  welcome_pack: "Welcome pack",
  recognition: "Recognition",
};

function preferenceKey(domain: string, type: string, channel: Channel) {
  return `${domain}:${type}:${channel}`;
}

export default function NotificationPreferences({
  preferences,
  isAdmin = false,
}: {
  preferences: Preference[];
  isAdmin?: boolean;
}) {
  const entries = NOTIFICATION_CATALOG.filter(
    (entry) => entry.audience === "developer" || isAdmin,
  );
  const configurable = entries.filter((entry) => entry.configurable);
  const alwaysOn = entries.filter((entry) => !entry.configurable);

  const initial = new Map<string, boolean>();
  for (const item of configurable) {
    for (const channel of channelsForEntry(item)) {
      const stored = preferences.find(
        (preference) =>
          preference.domain === item.domain &&
          preference.type === item.type &&
          preference.channel === channel,
      );
      initial.set(
        preferenceKey(item.domain, item.type, channel),
        stored?.enabled ?? item.defaults[channel] ?? false,
      );
    }
  }

  const [optimistic, setOptimistic] = useOptimistic(
    initial,
    (
      current,
      next: {
        key: string;
        enabled: boolean;
      },
    ) => {
      const updated = new Map(current);
      updated.set(next.key, next.enabled);
      return updated;
    },
  );
  const [isPending, startTransition] = useTransition();

  function checked(item: NotificationCatalogEntry, channel: Channel) {
    return (
      optimistic.get(preferenceKey(item.domain, item.type, channel)) ??
      item.defaults[channel]
    );
  }

  function update(
    item: NotificationCatalogEntry,
    channel: Channel,
    enabled: boolean,
  ) {
    const key = preferenceKey(item.domain, item.type, channel);
    startTransition(async () => {
      setOptimistic({ key, enabled });
      const result = await updateNotificationPreference({
        domain: item.domain,
        type: item.type,
        channel,
        enabled,
      });
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  const configurableByDomain = new Map<string, NotificationCatalogEntry[]>();
  for (const item of configurable) {
    const group = configurableByDomain.get(item.domain) ?? [];
    group.push(item);
    configurableByDomain.set(item.domain, group);
  }

  return (
    <FormSection
      title="Notification Preferences"
      description="Everything DevHub can notify you about, grouped by area. Money-critical and compliance updates are always sent so nothing important slips past you."
    >
      {[...configurableByDomain.entries()].map(([domain, items]) => (
        <Stack key={domain} gap="sm">
          <Text fw={700} fz="sm" tt="uppercase" c="dimmed">
            {DOMAIN_TITLES[domain] ?? domain}
          </Text>
          {items.map((item) => (
            <Group key={`${item.domain}:${item.type}`} justify="space-between">
              <Stack gap={2} style={{ flex: 1 }}>
                <Group gap={6}>
                  <Text fw={700}>{item.title}</Text>
                  {item.audience === "admin" && (
                    <Badge size="xs" variant="light" color="gray">
                      Admin
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {item.description}
                </Text>
              </Stack>
              <Group gap="md">
                <Switch
                  label="In-app"
                  checked={checked(item, "in_app")}
                  disabled={isPending}
                  onChange={(event) =>
                    update(item, "in_app", event.currentTarget.checked)
                  }
                />
                <Switch
                  label="Email"
                  checked={checked(item, "email")}
                  disabled={isPending}
                  onChange={(event) =>
                    update(item, "email", event.currentTarget.checked)
                  }
                />
                {/* Only rendered where the catalog says Discord can carry
                    this notification, so no toggle is ever decorative. */}
                {item.defaults.discord !== undefined && (
                  <Switch
                    label="Discord"
                    checked={checked(item, "discord")}
                    disabled={isPending}
                    onChange={(event) =>
                      update(item, "discord", event.currentTarget.checked)
                    }
                  />
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      ))}

      <Divider />

      <Stack gap="xs">
        <Text fw={700} fz="sm" tt="uppercase" c="dimmed">
          Always sent
        </Text>
        <Text size="sm" c="dimmed">
          These cover money, compliance, and your orders — they can&apos;t be
          switched off so a payout or verification never stalls silently.
        </Text>
        <Group gap={6} wrap="wrap">
          {alwaysOn.map((item) => (
            <Badge
              key={`${item.domain}:${item.type}`}
              variant="light"
              color="gray"
              size="sm"
              style={{ textTransform: "none" }}
              title={item.description}
            >
              {item.title}
            </Badge>
          ))}
        </Group>
      </Stack>
    </FormSection>
  );
}
