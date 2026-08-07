"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  Archive,
  Bot,
  ChevronDown,
  CircleStop,
  Compass,
  History,
  Lightbulb,
  ListChecks,
  MoreHorizontal,
  Plus,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";
import type {
  AssistantActionDto,
  AssistantConversationDto,
  AssistantConversationSummary,
  AssistantMessageDto,
  AssistantReferenceDto,
  AssistantStreamEvent,
} from "@/lib/assistant-types";
import classes from "./AssistantExperience.module.css";
import {
  AssistantMessage,
  type AssistantRunActivity,
} from "./AssistantMessage";
import { ASSISTANT_STARTERS } from "./assistant-prompts";

type AssistantExperienceProps = {
  available: boolean;
  mode: "page" | "overlay";
  initialConversations?: AssistantConversationSummary[];
  initialConversation?: AssistantConversationDto | null;
  enabled?: boolean;
  onClose?: () => void;
  displayName?: string | null;
  quickPrompts?: string[];
  targetConversationId?: string | null;
  initialPrompt?: string | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

function upsertAction(
  messages: AssistantMessageDto[],
  action: AssistantActionDto,
) {
  const existingMsgIndex = messages.findIndex((m) =>
    m.actions.some((item) => item.id === action.id),
  );

  if (existingMsgIndex >= 0) {
    return messages.map((message, i) => {
      if (i !== existingMsgIndex) return message;
      const actions = message.actions.map((item) =>
        item.id === action.id ? action : item,
      );
      return { ...message, actions };
    });
  }

  let targetIndex = -1;
  if (action.messageId) {
    targetIndex = messages.findIndex((m) => m.id === action.messageId);
  }

  if (targetIndex < 0) {
    targetIndex = messages.findIndex(
      (m) => m.role === "assistant" && m.status === "PENDING",
    );
  }

  if (targetIndex < 0) {
    targetIndex = messages.findLastIndex((m) => m.role === "assistant");
  }

  if (targetIndex < 0 && messages.length > 0) {
    targetIndex = messages.length - 1;
  }

  if (targetIndex >= 0) {
    return messages.map((message, i) => {
      if (i !== targetIndex) return message;
      if (message.actions.some((a) => a.id === action.id)) return message;
      return { ...message, actions: [...message.actions, action] };
    });
  }

  return messages;
}

function addReferences(
  messages: AssistantMessageDto[],
  references: AssistantReferenceDto[],
) {
  return messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "PENDING") {
      return message;
    }
    return {
      ...message,
      references: [
        ...new Map(
          [...message.references, ...references].map((reference) => [
            `${reference.kind}:${reference.id}`,
            reference,
          ]),
        ).values(),
      ],
    };
  });
}

function starterIcon(label: string) {
  if (label === "Shape an idea") return <Lightbulb size={18} />;
  if (label === "Plan my next move") return <Compass size={18} />;
  if (label === "Find paid work") return <Rocket size={18} />;
  return <WandSparkles size={18} />;
}

function conversationTitle(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 60);
}

export default function AssistantExperience({
  available,
  mode,
  initialConversations = [],
  initialConversation = null,
  enabled = true,
  onClose,
  displayName,
  quickPrompts = [],
  targetConversationId = null,
  initialPrompt = null,
}: AssistantExperienceProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState(initialConversation);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runMessageId, setRunMessageId] = useState<string | null>(null);
  const [activities, setActivities] = useState<AssistantRunActivity[]>([]);
  const [providerTrail, setProviderTrail] = useState<string[]>([]);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runMessageIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const conversationRequestRef = useRef(0);
  const loadedRef = useRef(mode === "page");
  const lastMessage = active?.messages.at(-1);
  const scrollSignal = [
    lastMessage?.id,
    lastMessage?.content.length,
    lastMessage?.status,
    lastMessage?.actions
      .map((action) => `${action.id}:${action.status}`)
      .join(","),
    lastMessage?.references.map((reference) => reference.id).join(","),
    activities.map((activity) => `${activity.id}:${activity.phase}`).join(","),
  ].join(":");

  useEffect(() => {
    if (!scrollSignal || !stickToBottomRef.current) return;
    const viewport = messagesViewportRef.current;
    const frame = window.requestAnimationFrame(() => {
      viewport?.scrollTo({
        top: viewport.scrollHeight,
        behavior: sending ? "smooth" : "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollSignal, sending]);

  useEffect(() => {
    if (mode === "overlay" && enabled) {
      const timer = window.setTimeout(() => composerRef.current?.focus(), 180);
      return () => window.clearTimeout(timer);
    }
  }, [enabled, mode]);

  const refreshList = useCallback(async () => {
    const data = await responseJson<{
      conversations: AssistantConversationSummary[];
    }>(await fetch("/api/assistant/conversations"));
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const requestId = ++conversationRequestRef.current;
    setLoading(true);
    try {
      const data = await responseJson<{
        conversation: AssistantConversationDto;
      }>(await fetch(`/api/assistant/conversations/${id}`));
      if (requestId !== conversationRequestRef.current) return;
      setActive(data.conversation);
      setActivities([]);
      setProviderTrail([]);
      setRunMessageId(null);
      runMessageIdRef.current = null;
      stickToBottomRef.current = true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load this chat.",
      );
    } finally {
      if (requestId === conversationRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !available || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    refreshList()
      .then(async (items) => {
        if (items[0]) await openConversation(items[0].id);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not load chats.",
        ),
      )
      .finally(() => setLoading(false));
  }, [available, enabled, openConversation, refreshList]);

  const lastTargetIdRef = useRef<string | null>(null);
  const pendingPromptRef = useRef<string | null>(initialPrompt ?? null);

  useEffect(() => {
    if (initialPrompt) pendingPromptRef.current = initialPrompt;
  }, [initialPrompt]);

  const sendMessageRef = useRef<(value?: string) => Promise<void>>(
    async () => {},
  );
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => {
    if (
      !targetConversationId ||
      targetConversationId === lastTargetIdRef.current
    )
      return;
    lastTargetIdRef.current = targetConversationId;
    (async () => {
      await openConversation(targetConversationId);
      if (pendingPromptRef.current) {
        const promptToSubmit = pendingPromptRef.current;
        pendingPromptRef.current = null;
        await sendMessageRef.current(promptToSubmit);
      }
    })();
  }, [targetConversationId, openConversation]);

  async function createConversation() {
    const requestId = ++conversationRequestRef.current;
    const data = await responseJson<{
      conversation: AssistantConversationSummary;
    }>(await fetch("/api/assistant/conversations", { method: "POST" }));
    const conversation: AssistantConversationDto = {
      ...data.conversation,
      messages: [],
    };
    if (requestId !== conversationRequestRef.current) return conversation;
    setConversations((current) => [
      data.conversation,
      ...current.filter((item) => item.id !== data.conversation.id),
    ]);
    setActive(conversation);
    setActivities([]);
    setProviderTrail([]);
    setRunMessageId(null);
    runMessageIdRef.current = null;
    stickToBottomRef.current = true;
    return conversation;
  }

  async function archiveConversation(id: string) {
    try {
      await responseJson(
        await fetch(`/api/assistant/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        }),
      );
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (active?.id === id) {
        setActive(null);
        if (remaining[0]) await openConversation(remaining[0].id);
      }
      toast.success("Chat archived.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not archive chat.",
      );
    }
  }

  async function deleteConversation(id: string) {
    try {
      await responseJson(
        await fetch(`/api/assistant/conversations/${id}`, {
          method: "DELETE",
        }),
      );
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (active?.id === id) {
        setActive(null);
        if (remaining[0]) await openConversation(remaining[0].id);
      }
      toast.success("Chat deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete chat.",
      );
    }
  }

  function applyEvent(event: AssistantStreamEvent) {
    if (event.type === "start") {
      setRunMessageId(event.message.id);
      runMessageIdRef.current = event.message.id;
      setActivities([]);
      setProviderTrail([]);
      setActive((current) =>
        current
          ? {
              ...current,
              title:
                current.title === "New conversation"
                  ? conversationTitle(event.userMessage.content)
                  : current.title,
              messages: [...current.messages, event.userMessage, event.message],
            }
          : current,
      );
      return;
    }
    if (event.type === "delta") {
      setActive((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.role === "assistant" && message.status === "PENDING"
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            }
          : current,
      );
      return;
    }
    if (event.type === "provider") {
      setProviderTrail((current) =>
        current.includes(event.provider)
          ? current
          : [...current, event.provider],
      );
      return;
    }
    if (event.type === "tool") {
      setActivities((current) => {
        const next: AssistantRunActivity = {
          id: event.toolCallId,
          name: event.name,
          phase: event.phase,
          label: event.label,
          detail: event.detail,
        };
        const index = current.findIndex((item) => item.id === event.toolCallId);
        if (index < 0) return [...current, next];
        const copy = [...current];
        copy[index] = next;
        return copy;
      });
      return;
    }
    if (event.type === "action") {
      setActive((current) =>
        current
          ? {
              ...current,
              messages: upsertAction(current.messages, event.action),
            }
          : current,
      );
      return;
    }
    if (event.type === "references") {
      setActive((current) =>
        current
          ? {
              ...current,
              messages: addReferences(current.messages, event.references),
            }
          : current,
      );
      return;
    }
    const finalMessage = event.message;
    if (!finalMessage) {
      if (event.type === "error") toast.error(event.error);
      return;
    }
    setActive((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.id === finalMessage.id ? finalMessage : message,
            ),
          }
        : current,
    );
    if (event.type === "error") toast.error(event.error);
  }

  function markInterrupted() {
    setActive((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.id === runMessageIdRef.current
                ? { ...message, status: "INTERRUPTED" as const }
                : message,
            ),
          }
        : current,
    );
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || sending || !available) return;
    setSending(true);
    setDraft("");
    stickToBottomRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const conversation = active ?? (await createConversation());
      const response = await fetch(
        `/api/assistant/conversations/${conversation.id}/turns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "I couldn’t send that message.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value: chunk, done } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const data = part
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("");
          if (data) applyEvent(JSON.parse(data) as AssistantStreamEvent);
        }
        if (done) break;
      }
      await refreshList();
    } catch (error) {
      if (controller.signal.aborted) {
        markInterrupted();
      } else {
        setDraft(content);
        toast.error(
          error instanceof Error
            ? error.message
            : "I couldn’t send that message.",
        );
      }
    } finally {
      controllerRef.current = null;
      setSending(false);
    }
  }

  function stopReply() {
    controllerRef.current?.abort();
    markInterrupted();
  }

  function handlePrompt(prompt: string, prefill?: string) {
    if (prefill || /help me scope an idea/i.test(prompt)) {
      setDraft(prefill ?? "I want to build ");
      window.requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    sendMessage(prompt);
  }

  function updateAction(action: AssistantActionDto) {
    setActive((current) =>
      current
        ? { ...current, messages: upsertAction(current.messages, action) }
        : current,
    );
  }

  const retryPrompts = useMemo(() => {
    const prompts = new Map<string, string>();
    const messages = active?.messages ?? [];
    messages.forEach((message, index) => {
      if (message.role !== "assistant" || message.status !== "FAILED") return;
      const previous = messages
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.role === "user");
      if (previous) prompts.set(message.id, previous.content);
    });
    return prompts;
  }, [active?.messages]);

  const compact = mode === "overlay";
  const shellClass = [classes.chatShell];
  if (compact) shellClass.push(classes.chatShellCompact);

  const chat = (
    <Card className={shellClass.join(" ")} padding={0}>
      <Stack gap={0} className={classes.chatColumn}>
        <Group
          className={classes.chatHeader}
          px={compact ? "sm" : "md"}
          py="sm"
          justify="space-between"
          wrap="nowrap"
        >
          <Group className={classes.chatIdentity} gap="sm" wrap="nowrap">
            <motion.div
              animate={sending ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
              transition={{ duration: 1.8, repeat: sending ? Infinity : 0 }}
            >
              <ThemeIcon className={classes.assistantOrb} radius="xl" size="lg">
                <Sparkles size={18} />
              </ThemeIcon>
            </motion.div>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Group gap={6} wrap="nowrap">
                <Text fw={750} size="sm" truncate>
                  {active?.title ?? "DevHub Assistant"}
                </Text>
                <Badge
                  className={classes.readyBadge}
                  size="xs"
                  color="teal"
                  variant="dot"
                >
                  Ready
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" truncate>
                Helpful, brief, and always asks before changes
              </Text>
            </Stack>
          </Group>

          <Group gap={3} wrap="nowrap" style={{ flexShrink: 0 }}>
            {loading && <Loader size="xs" />}
            {compact && (
              <Tooltip label="New chat">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="New chat"
                  disabled={sending}
                  onClick={() =>
                    createConversation().catch((error) =>
                      toast.error(error.message),
                    )
                  }
                >
                  <Plus size={17} />
                </ActionIcon>
              </Tooltip>
            )}
            {compact && (
              <Menu position="bottom-end" withinPortal width={260} zIndex={410}>
                <MenuTarget>
                  <Tooltip label="Recent chats">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Recent chats"
                    >
                      <History size={17} />
                    </ActionIcon>
                  </Tooltip>
                </MenuTarget>
                <MenuDropdown className={classes.chatMenuDropdown}>
                  {conversations.slice(0, 8).map((conversation) => (
                    <MenuItem
                      key={conversation.id}
                      disabled={sending}
                      leftSection={
                        active?.id === conversation.id ? (
                          <Sparkles size={14} />
                        ) : (
                          <Bot size={14} />
                        )
                      }
                      onClick={() => openConversation(conversation.id)}
                    >
                      <Text size="sm" truncate>
                        {conversation.title}
                      </Text>
                    </MenuItem>
                  ))}
                  {conversations.length === 0 && (
                    <Text size="xs" c="dimmed" px="sm" py="xs">
                      Your chats will appear here.
                    </Text>
                  )}
                  <Divider my={4} />
                  <MenuItem
                    leftSection={<Plus size={14} />}
                    disabled={sending}
                    onClick={() =>
                      createConversation().catch((error) =>
                        toast.error(error.message),
                      )
                    }
                  >
                    New chat
                  </MenuItem>
                  <MenuItem
                    component={Link}
                    href="/dashboard/assistant"
                    leftSection={<ListChecks size={14} />}
                    disabled={sending}
                  >
                    Open full assistant
                  </MenuItem>
                </MenuDropdown>
              </Menu>
            )}
            {!compact && (
              <Tooltip label="New chat">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="New chat"
                  disabled={sending}
                  onClick={() =>
                    createConversation().catch((error) =>
                      toast.error(error.message),
                    )
                  }
                >
                  <Plus size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            {compact && onClose && (
              <Tooltip label="Close">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Close assistant"
                  onClick={onClose}
                >
                  <X size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>

        <ScrollArea
          viewportRef={messagesViewportRef}
          className={classes.messages}
          px={compact ? "sm" : "md"}
          py="md"
          onScrollPositionChange={() => {
            const viewport = messagesViewportRef.current;
            if (!viewport) return;
            stickToBottomRef.current =
              viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <
              80;
          }}
        >
          <Stack gap="md">
            {active?.messages.map((message) => (
              <AssistantMessage
                key={message.id}
                message={message}
                onActionChange={updateAction}
                activities={message.id === runMessageId ? activities : []}
                providerTrail={message.id === runMessageId ? providerTrail : []}
                onPrompt={handlePrompt}
                onRetry={
                  retryPrompts.has(message.id)
                    ? () => sendMessage(retryPrompts.get(message.id))
                    : undefined
                }
              />
            ))}

            {(!active || active.messages.length === 0) && (
              <Stack
                className={classes.emptyState}
                align="center"
                justify="center"
                gap="lg"
              >
                <div className={classes.emptyGlow} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={SPRING.pop}
                >
                  <ThemeIcon
                    className={classes.assistantOrb}
                    size={56}
                    radius="xl"
                  >
                    <Bot size={27} />
                  </ThemeIcon>
                </motion.div>
                <Stack gap={4} align="center" style={{ zIndex: 1 }}>
                  <Text fw={800} size="lg" ta="center">
                    {displayName
                      ? `Hey ${displayName.split(" ")[0]} — what’s up?`
                      : "What can I make easier?"}
                  </Text>
                  <Text size="sm" c="dimmed" ta="center" maw={480}>
                    Bring a rough idea, a blocker, or a task. We’ll keep it
                    short and find one useful next step.
                  </Text>
                </Stack>
                <div className={classes.starterGrid}>
                  {ASSISTANT_STARTERS.map((starter, index) => (
                    <motion.div
                      key={starter.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING.soft, delay: 0.05 * index }}
                    >
                      <UnstyledButton
                        className={classes.starterCard}
                        onClick={() =>
                          handlePrompt(starter.prompt, starter.prefill)
                        }
                        disabled={sending}
                      >
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                          <ThemeIcon
                            color={starter.tone}
                            variant="light"
                            radius="md"
                          >
                            {starterIcon(starter.label)}
                          </ThemeIcon>
                          <Stack gap={2}>
                            <Text size="sm" fw={700}>
                              {starter.label}
                            </Text>
                            <Text size="xs" c="dimmed" lh={1.4}>
                              {starter.description}
                            </Text>
                          </Stack>
                        </Group>
                      </UnstyledButton>
                    </motion.div>
                  ))}
                </div>
              </Stack>
            )}
          </Stack>
        </ScrollArea>

        <div className={classes.composer}>
          {quickPrompts.length > 0 && (
            <div className={classes.quickPrompts}>
              {quickPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  size="compact-xs"
                  variant="light"
                  color="gray"
                  radius="xl"
                  disabled={sending}
                  onClick={() => handlePrompt(prompt)}
                  style={{ flex: "0 0 auto" }}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          )}
          <div style={{ position: "relative", padding: compact ? 10 : 14 }}>
            <Textarea
              ref={composerRef}
              className={classes.composerInput}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask, plan, or paste a rough idea…"
              aria-label="Message DevHub Assistant"
              autosize
              minRows={1}
              maxRows={compact ? 4 : 6}
              maxLength={8_000}
              disabled={sending}
            />
            <Tooltip label={sending ? "Stop" : "Send"}>
              <ActionIcon
                className={classes.sendButton}
                size="lg"
                radius="md"
                color={sending ? "red" : "blue"}
                variant={sending ? "light" : "filled"}
                aria-label={sending ? "Stop reply" : "Send message"}
                disabled={!sending && !draft.trim()}
                onClick={sending ? stopReply : () => sendMessage()}
                style={{
                  right: compact ? 18 : 22,
                  bottom: compact ? 18 : 22,
                }}
              >
                {sending ? <CircleStop size={17} /> : <Send size={17} />}
              </ActionIcon>
            </Tooltip>
          </div>
          <Text size="xs" c="dimmed" ta="center" pb={8} px="sm">
            Enter to send · Shift + Enter for a new line
          </Text>
        </div>
      </Stack>
    </Card>
  );

  if (!available) {
    return (
      <Alert
        color="blue"
        icon={<Bot size={18} />}
        title="Assistant is taking a break"
      >
        You can still shape and submit ideas from the{" "}
        <Link href="/dashboard/ppts/ideas">Task Ideas page</Link>.
      </Alert>
    );
  }

  if (compact) return chat;

  return (
    <div className={classes.pageGrid}>
      <Card className={classes.historyCard} padding="sm" radius="lg">
        <Button
          fullWidth
          variant="light"
          leftSection={<Plus size={16} />}
          disabled={sending}
          onClick={() =>
            createConversation().catch((error) => toast.error(error.message))
          }
        >
          New chat
        </Button>
        <Divider my="sm" />
        <Group justify="space-between" px={4} mb={6}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Recent
          </Text>
          <ChevronDown size={13} color="var(--mantine-color-dimmed)" />
        </Group>
        <ScrollArea h={600}>
          <Stack gap={4}>
            {conversations.map((conversation) => (
              <Group key={conversation.id} gap={3} wrap="nowrap">
                <Button
                  variant={active?.id === conversation.id ? "light" : "subtle"}
                  color={active?.id === conversation.id ? "blue" : "gray"}
                  justify="flex-start"
                  fullWidth
                  size="compact-sm"
                  disabled={sending}
                  onClick={() => openConversation(conversation.id)}
                  styles={{
                    label: { overflow: "hidden", textOverflow: "ellipsis" },
                  }}
                >
                  {conversation.title}
                </Button>
                <Menu position="bottom-end" withinPortal>
                  <MenuTarget>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Conversation options"
                      disabled={sending}
                    >
                      <MoreHorizontal size={15} />
                    </ActionIcon>
                  </MenuTarget>
                  <MenuDropdown>
                    <MenuItem
                      leftSection={<Archive size={14} />}
                      onClick={() => archiveConversation(conversation.id)}
                    >
                      Archive
                    </MenuItem>
                    <MenuItem
                      color="red"
                      leftSection={<Trash2 size={14} />}
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      Delete
                    </MenuItem>
                  </MenuDropdown>
                </Menu>
              </Group>
            ))}
            {conversations.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="lg">
                No chats yet. Start with one small thought.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Card>
      {chat}
    </div>
  );
}
