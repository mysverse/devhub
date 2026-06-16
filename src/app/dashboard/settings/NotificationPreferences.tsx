"use client";

import { Group, Stack, Switch, Text } from "@mantine/core";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import FormSection from "@/components/FormSection";
import { updateNotificationPreference } from "./actions";

type Channel = "in_app" | "email";

type Preference = {
  domain: string;
  type: string;
  channel: string;
  enabled: boolean;
};

type PreferenceItem = {
  domain: string;
  type: string;
  title: string;
  description: string;
  defaults: Record<Channel, boolean>;
};

const ITEMS: PreferenceItem[] = [
  {
    domain: "ppt_request",
    type: "APPROVED",
    title: "PPT request approved",
    description: "When an admin approves one of your PPT requests.",
    defaults: { in_app: true, email: true },
  },
  {
    domain: "ppt_request",
    type: "REJECTED",
    title: "PPT request rejected",
    description: "When an admin rejects one of your PPT requests.",
    defaults: { in_app: true, email: true },
  },
  {
    domain: "ppt_task",
    type: "ASSIGNED_TO_YOU",
    title: "PPT assigned to you",
    description: "When an approved PPT is assigned directly to you.",
    defaults: { in_app: true, email: true },
  },
  {
    domain: "ppt_task",
    type: "UNCLAIMED_AVAILABLE",
    title: "New unclaimed PPT available",
    description: "When an approved PPT is open for developers to claim.",
    defaults: { in_app: true, email: false },
  },
  {
    domain: "ppt_request",
    type: "SUBMITTED",
    title: "Admin: new PPT request",
    description: "Admin review notice when developers submit PPT requests.",
    defaults: { in_app: true, email: true },
  },
];

function preferenceKey(domain: string, type: string, channel: Channel) {
  return `${domain}:${type}:${channel}`;
}

export default function NotificationPreferences({
  preferences,
}: {
  preferences: Preference[];
}) {
  const initial = new Map<string, boolean>();
  for (const item of ITEMS) {
    for (const channel of ["in_app", "email"] as const) {
      const stored = preferences.find(
        (preference) =>
          preference.domain === item.domain &&
          preference.type === item.type &&
          preference.channel === channel,
      );
      initial.set(
        preferenceKey(item.domain, item.type, channel),
        stored?.enabled ?? item.defaults[channel],
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

  function checked(item: PreferenceItem, channel: Channel) {
    return (
      optimistic.get(preferenceKey(item.domain, item.type, channel)) ??
      item.defaults[channel]
    );
  }

  function update(item: PreferenceItem, channel: Channel, enabled: boolean) {
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

  return (
    <FormSection
      title="Notification Preferences"
      description="Choose how DevHub should notify you about PPT request and task events."
    >
      {ITEMS.map((item) => (
        <Group key={`${item.domain}:${item.type}`} justify="space-between">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text fw={700}>{item.title}</Text>
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
          </Group>
        </Group>
      ))}
    </FormSection>
  );
}
