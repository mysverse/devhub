"use client";

import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { Bot, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import AssistantExperience from "./AssistantExperience";
import classes from "./AssistantExperience.module.css";
import {
  assistantNudgeForPath,
  assistantPromptsForPath,
} from "./assistant-prompts";

const OPEN_EVENT = "devhub:assistant-open";
const NUDGE_KEY = "devhub-assistant-nudge-seen";

export default function AssistantOverlay({
  available,
}: {
  available: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [opened, setOpened] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [targetConversationId, setTargetConversationId] = useState<
    string | null
  >(null);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

  const onAssistantPage = pathname.startsWith("/dashboard/assistant");
  const isMainDashboard = pathname === "/dashboard";

  useEffect(() => setHydrated(true), []);

  const rememberNudge = useCallback(() => {
    setShowNudge(false);
    try {
      window.localStorage.setItem(NUDGE_KEY, "true");
    } catch {
      // Private browsing can deny storage.
    }
  }, []);

  const openAssistant = useCallback(() => {
    rememberNudge();
    setOpened(true);
  }, [rememberNudge]);

  useEffect(() => {
    if (!available || onAssistantPage) return;
    function open(event: Event) {
      const customEvent = event as CustomEvent<{
        conversationId?: string;
        initialPrompt?: string;
      }>;
      if (customEvent.detail?.conversationId) {
        setTargetConversationId(customEvent.detail.conversationId);
      }
      if (customEvent.detail?.initialPrompt) {
        setInitialPrompt(customEvent.detail.initialPrompt);
      }
      openAssistant();
    }
    function keyboardShortcut(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        openAssistant();
      }
      if (event.key === "Escape") setOpened(false);
    }
    window.addEventListener(OPEN_EVENT, open);
    window.addEventListener("keydown", keyboardShortcut);
    return () => {
      window.removeEventListener(OPEN_EVENT, open);
      window.removeEventListener("keydown", keyboardShortcut);
    };
  }, [available, onAssistantPage, openAssistant]);

  useEffect(() => {
    // Suppress timed nudge on main dashboard page to avoid duplicate prompts with the Command Bar
    if (!available || onAssistantPage || opened || isMainDashboard) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(NUDGE_KEY) === "true";
    } catch {
      seen = false;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setShowNudge(true), 2_500);
    return () => window.clearTimeout(timer);
  }, [available, onAssistantPage, opened, isMainDashboard]);

  if (!available || onAssistantPage) return null;

  return (
    <>
      <motion.div
        className={classes.overlayPanel}
        initial={false}
        animate={
          opened
            ? { opacity: 1, scale: 1, y: 0, visibility: "visible" }
            : {
                opacity: 0,
                scale: 0.96,
                y: 18,
                transitionEnd: { visibility: "hidden" },
              }
        }
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        role="dialog"
        aria-label="DevHub Assistant"
        aria-hidden={!opened}
        inert={!opened}
        style={{ pointerEvents: opened ? "auto" : "none" }}
      >
        <AssistantExperience
          mode="overlay"
          available={available}
          enabled={opened}
          onClose={() => setOpened(false)}
          displayName={hydrated ? session?.user?.name : null}
          quickPrompts={assistantPromptsForPath(pathname)}
          targetConversationId={targetConversationId}
          initialPrompt={initialPrompt}
        />
      </motion.div>

      <AnimatePresence>
        {showNudge && !opened && (
          <motion.div
            className={classes.nudge}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
          >
            <Paper radius="lg" p="sm" bg="transparent">
              <Group align="flex-start" wrap="nowrap" gap="sm">
                <ThemeIcon radius="xl" variant="light">
                  <Sparkles size={16} />
                </ThemeIcon>
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text size="sm" fw={700}>
                    Need a quick hand?
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.45}>
                    {assistantNudgeForPath(pathname)}
                  </Text>
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    px={0}
                    onClick={openAssistant}
                  >
                    Ask DevHub
                  </Button>
                </Stack>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Dismiss assistant suggestion"
                  onClick={rememberNudge}
                >
                  <X size={14} />
                </ActionIcon>
              </Group>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!opened && (
          <motion.div
            className={classes.launcher}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <Button
              className={classes.launcherButton}
              radius="xl"
              size="md"
              leftSection={<Bot size={18} />}
              onClick={openAssistant}
              aria-expanded={false}
              aria-label="Ask DevHub Assistant"
            >
              Ask DevHub
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
