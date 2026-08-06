"use client";

import {
  ActionIcon,
  Card,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { Check, Circle, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { dismissGettingStarted } from "@/app/dashboard/actions";
import { FadeIn } from "@/components/animations";
import LinkButton from "@/components/LinkButton";

export type GettingStartedStep = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

/**
 * First-run guidance: a dismissible checklist whose completion is derived
 * from real data server-side. Shows new developers the path from zero to
 * first payout, then gets out of the way.
 */
export default function GettingStartedChecklist({
  steps,
}: {
  steps: GettingStartedStep[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  const allDone = doneCount === steps.length;

  // A finished checklist retires itself: the card is shown once so the last
  // step visibly checks off, and the dismissal is persisted so it never comes
  // back. Previously the whole card just disappeared the moment the first
  // payout landed, so the finish line was never actually rendered.
  useEffect(() => {
    if (!allDone || dismissed) return;
    startTransition(async () => {
      await dismissGettingStarted();
    });
  }, [allDone, dismissed]);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    startTransition(async () => {
      await dismissGettingStarted();
    });
  }

  if (allDone) {
    return (
      <FadeIn>
        <Card withBorder radius="lg" padding="lg">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon variant="light" color="green" size={28} radius="xl">
              <Check size={16} />
            </ThemeIcon>
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} fz="lg">
                You&rsquo;re all set up
              </Text>
              <Text fz="sm" c="dimmed">
                Claimed, proven, and paid — that&rsquo;s the whole loop. Every
                task from here works the same way.
              </Text>
            </Stack>
            <LinkButton href="/dashboard/ppts" size="xs" variant="light">
              Find your next task
            </LinkButton>
          </Group>
        </Card>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" mb="sm">
          <Stack gap={2}>
            <Text fw={700} fz="lg">
              Getting started
            </Text>
            <Text fz="sm" c="dimmed">
              The path from zero to your first payout — {doneCount} of{" "}
              {steps.length} done.
            </Text>
          </Stack>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={handleDismiss}
            aria-label="Dismiss getting started checklist"
          >
            <X size={16} />
          </ActionIcon>
        </Group>
        <Progress
          value={(doneCount / steps.length) * 100}
          color="green"
          size="sm"
          radius="xl"
          mb="md"
        />
        <Stack gap="sm">
          {steps.map((step) => (
            <Group key={step.key} gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon
                variant="light"
                color={step.done ? "green" : "gray"}
                size={28}
                radius="xl"
              >
                {step.done ? <Check size={16} /> : <Circle size={12} />}
              </ThemeIcon>
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text
                  fw={600}
                  fz="sm"
                  td={step.done ? "line-through" : undefined}
                  c={step.done ? "dimmed" : undefined}
                >
                  {step.title}
                </Text>
                {!step.done && (
                  <Text fz="xs" c="dimmed">
                    {step.description}
                  </Text>
                )}
              </Stack>
              {!step.done && step.key === nextStep?.key && (
                <LinkButton href={step.href} size="xs" variant="light">
                  {step.cta}
                </LinkButton>
              )}
            </Group>
          ))}
        </Stack>
      </Card>
    </FadeIn>
  );
}
