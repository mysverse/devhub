"use client";

import {
  Anchor,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { ArrowRight, Bot, Lightbulb, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import classes from "./AssistantCommandBar.module.css";

const PLACEHOLDERS = [
  "Build a car for Lebuhraya...",
  "Make this bonus-eligible...",
  "Find me a small PPT...",
  "Draft a scripting task for racing...",
];

export default function AssistantCommandBar({
  available = true,
}: {
  available?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4_000);
    return () => clearInterval(timer);
  }, []);

  async function handleSubmit(event?: React.FormEvent) {
    if (event) event.preventDefault();
    const prompt = value.trim();
    if (!prompt || submitting) return;

    if (!available) {
      router.push("/dashboard/ppts/ideas");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create fresh conversation with entryPoint: DASHBOARD
      const response = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryPoint: "DASHBOARD" }),
      });
      const data = (await response.json()) as {
        conversation?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.conversation || data.error) {
        throw new Error(
          data.error ?? "Failed to start assistant conversation.",
        );
      }

      const conversationId = data.conversation.id;

      // 2. Open overlay & send message once
      window.dispatchEvent(
        new CustomEvent("devhub:assistant-open", {
          detail: { conversationId, initialPrompt: prompt },
        }),
      );
      setValue("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open assistant.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Paper radius="xl" className={classes.commandBarPaper} p="lg">
      <div className={classes.gradientBg} />
      <Stack gap="md" style={{ position: "relative", zIndex: 1 }}>
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon radius="xl" size="lg" className={classes.orbIcon}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles size={18} />
              </motion.div>
            </ThemeIcon>
            <div>
              <Text fw={850} size="lg" c="white" lh={1.2}>
                What do you want to get done?
              </Text>
              <Text size="xs" c="dimmed" mt={1}>
                Ask DevHub to draft tasks, request PPTs, or prepare bonus-path
                work.
              </Text>
            </div>
          </Group>
          {!available && (
            <Anchor
              href="/dashboard/ppts/ideas"
              size="xs"
              fw={700}
              c="blue.3"
              style={{ textDecoration: "underline" }}
            >
              Browse Task Ideas &rarr;
            </Anchor>
          )}
        </Group>

        {available ? (
          <form onSubmit={handleSubmit}>
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="md"
                radius="xl"
                className={classes.commandInput}
                placeholder={PLACEHOLDERS[placeholderIndex]}
                value={value}
                onChange={(e) => setValue(e.currentTarget.value)}
                leftSection={
                  <Bot size={18} color="var(--mantine-color-blue-4)" />
                }
                style={{ flex: 1 }}
                data-testid="assistant-command-input"
              />
              <Button
                type="submit"
                size="md"
                radius="xl"
                color="blue"
                loading={submitting}
                rightSection={<ArrowRight size={16} />}
              >
                Go
              </Button>
            </Group>
          </form>
        ) : (
          <Paper p="sm" radius="lg" bg="rgba(37, 38, 43, 0.6)">
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Assistant model provider not configured. Use Task Ideas to
                browse recommended work.
              </Text>
              <Button
                component="a"
                href="/dashboard/ppts/ideas"
                size="xs"
                variant="light"
                color="blue"
                leftSection={<Lightbulb size={14} />}
              >
                Open Task Ideas
              </Button>
            </Group>
          </Paper>
        )}

        <Group gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed" fw={600}>
            Examples:
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              setValue("Build a car for Lebuhraya");
            }}
          >
            &ldquo;Build a car for Lebuhraya&rdquo;
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              setValue("Make this bonus-eligible");
            }}
          >
            &ldquo;Make this bonus-eligible&rdquo;
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              setValue("Find me a small PPT");
            }}
          >
            &ldquo;Find me a small PPT&rdquo;
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
