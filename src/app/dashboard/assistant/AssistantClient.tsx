"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Grid,
  GridCol,
  Group,
  Loader,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  Archive,
  Bot,
  Check,
  CircleAlert,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import type {
  AssistantActionDto,
  AssistantConversationDto,
  AssistantConversationSummary,
  AssistantMessageDto,
  AssistantStreamEvent,
} from "@/lib/assistant-types";

const STARTERS = [
  "Help me turn a rough idea into a scoped task",
  "What tasks am I currently assigned?",
  "Show me open PPTs that I could claim",
  "Explain how proof and progress updates work",
];

async function responseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

function upsertAction(
  messages: AssistantMessageDto[],
  action: AssistantActionDto,
) {
  return messages.map((message) => {
    const index = message.actions.findIndex((item) => item.id === action.id);
    if (index >= 0) {
      const actions = [...message.actions];
      actions[index] = action;
      return { ...message, actions };
    }
    if (message.role === "assistant" && message.status === "PENDING") {
      return { ...message, actions: [...message.actions, action] };
    }
    return message;
  });
}

function ActionCard({
  action,
  onChange,
}: {
  action: AssistantActionDto;
  onChange: (action: AssistantActionDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pending = action.status === "PENDING";

  async function decide(decision: "confirm" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch(`/api/assistant/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = (await response.json()) as {
        action: AssistantActionDto;
        error?: string;
      };
      if (data.action) onChange(data.action);
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Action failed.");
      } else {
        toast.success(
          decision === "confirm" ? "Action completed." : "Action cancelled.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder radius="md" padding="md" mt="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={3}>
          <Text fw={700} size="sm">
            {action.preview.title}
          </Text>
          <Text size="xs" c="dimmed">
            {action.preview.description}
          </Text>
        </Stack>
        <Badge
          color={
            action.status === "SUCCEEDED"
              ? "green"
              : action.status === "FAILED"
                ? "red"
                : action.status === "PENDING"
                  ? "blue"
                  : "gray"
          }
          variant="light"
        >
          {action.status.toLowerCase()}
        </Badge>
      </Group>
      {action.preview.warning && (
        <Alert color="yellow" mt="sm" icon={<CircleAlert size={15} />}>
          {action.preview.warning}
        </Alert>
      )}
      <Code
        block
        mt="sm"
        style={{ maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap" }}
      >
        {JSON.stringify(action.payload, null, 2)}
      </Code>
      {action.error && (
        <Text c="red" size="xs" mt="xs">
          {action.error}
        </Text>
      )}
      {pending && (
        <Group mt="md" gap="xs">
          <Button
            size="xs"
            leftSection={<Check size={14} />}
            loading={busy}
            onClick={() => decide("confirm")}
          >
            Confirm
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<X size={14} />}
            disabled={busy}
            onClick={() => decide("cancel")}
          >
            Cancel
          </Button>
          <Text size="xs" c="dimmed">
            Expires{" "}
            {new Date(action.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </Group>
      )}
    </Card>
  );
}

function MessageBubble({
  message,
  onActionChange,
}: {
  message: AssistantMessageDto;
  onActionChange: (action: AssistantActionDto) => void;
}) {
  const assistant = message.role === "assistant";
  return (
    <Group
      align="flex-start"
      wrap="nowrap"
      justify={assistant ? "flex-start" : "flex-end"}
    >
      {assistant && (
        <ThemeIcon variant="light" radius="xl" size="sm">
          <Bot size={14} />
        </ThemeIcon>
      )}
      <Paper
        withBorder={assistant}
        bg={assistant ? undefined : "blue.9"}
        px="md"
        py="sm"
        radius="md"
        style={{ maxWidth: "min(88%, 720px)", overflowWrap: "anywhere" }}
      >
        {message.content ? (
          assistant ? (
            <div className="assistant-markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          ) : (
            <Text size="sm">{message.content}</Text>
          )
        ) : message.status === "PENDING" ? (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Thinking…
            </Text>
          </Group>
        ) : null}
        {message.status === "FAILED" && (
          <Text size="xs" c="red" mt={4}>
            Reply failed — you can try again.
          </Text>
        )}
        {message.status === "INTERRUPTED" && (
          <Text size="xs" c="dimmed" mt={4}>
            Reply interrupted.
          </Text>
        )}
        {message.actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onChange={onActionChange}
          />
        ))}
      </Paper>
      {!assistant && (
        <ThemeIcon variant="light" color="gray" radius="xl" size="sm">
          <UserRound size={14} />
        </ThemeIcon>
      )}
    </Group>
  );
}

export default function AssistantClient({
  initialConversations,
  initialConversation,
  available,
}: {
  initialConversations: AssistantConversationSummary[];
  initialConversation: AssistantConversationDto | null;
  available: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState(initialConversation);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  });

  const refreshList = useCallback(async () => {
    const data = await responseJson<{
      conversations: AssistantConversationSummary[];
    }>(await fetch("/api/assistant/conversations"));
    setConversations(data.conversations);
  }, []);

  async function createConversation() {
    const data = await responseJson<{
      conversation: AssistantConversationSummary;
    }>(await fetch("/api/assistant/conversations", { method: "POST" }));
    const conversation: AssistantConversationDto = {
      ...data.conversation,
      messages: [],
    };
    setConversations((current) => [data.conversation, ...current]);
    setActive(conversation);
    return conversation;
  }

  async function openConversation(id: string) {
    if (id === active?.id) return;
    setLoading(true);
    try {
      const data = await responseJson<{
        conversation: AssistantConversationDto;
      }>(await fetch(`/api/assistant/conversations/${id}`));
      setActive(data.conversation);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load conversation.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function archiveConversation(id: string) {
    await responseJson(
      await fetch(`/api/assistant/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
    );
    const remaining = conversations.filter(
      (conversation) => conversation.id !== id,
    );
    setConversations(remaining);
    if (active?.id === id) {
      setActive(null);
      if (remaining[0]) await openConversation(remaining[0].id);
    }
  }

  async function deleteConversation(id: string) {
    await responseJson(
      await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" }),
    );
    const remaining = conversations.filter(
      (conversation) => conversation.id !== id,
    );
    setConversations(remaining);
    if (active?.id === id) setActive(null);
  }

  function applyEvent(event: AssistantStreamEvent) {
    if (event.type === "start") {
      setActive((current) =>
        current
          ? {
              ...current,
              title:
                current.title === "New conversation"
                  ? event.userMessage.content.replace(/\s+/g, " ").slice(0, 60)
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
    if (event.type === "done" || event.type === "error") {
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
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || sending || !available) return;
    setSending(true);
    setDraft("");
    try {
      const conversation = active ?? (await createConversation());
      const response = await fetch(
        `/api/assistant/conversations/${conversation.id}/turns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!response.ok || !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "The message could not be sent.");
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
      setDraft(content);
      toast.error(
        error instanceof Error
          ? error.message
          : "The message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  function updateAction(action: AssistantActionDto) {
    setActive((current) =>
      current
        ? { ...current, messages: upsertAction(current.messages, action) }
        : current,
    );
  }

  if (!available) {
    return (
      <Alert
        color="blue"
        icon={<Bot size={18} />}
        title="Assistant unavailable"
      >
        The model adapter is not configured right now. You can still flesh out
        and submit ideas from the{" "}
        <Link href="/dashboard/ppts/ideas">Task Ideas page</Link>.
      </Alert>
    );
  }

  return (
    <Grid gap="md">
      <GridCol span={{ base: 12, md: 3 }}>
        <Card withBorder radius="md" padding="sm" h="100%">
          <Button
            fullWidth
            variant="light"
            leftSection={<Plus size={16} />}
            onClick={() =>
              createConversation().catch((error) => toast.error(error.message))
            }
          >
            New chat
          </Button>
          <Divider my="sm" />
          <ScrollArea h={{ base: 150, md: 570 }}>
            <Stack gap={4}>
              {conversations.map((conversation) => (
                <Group key={conversation.id} gap={4} wrap="nowrap">
                  <Button
                    variant={
                      active?.id === conversation.id ? "light" : "subtle"
                    }
                    color={active?.id === conversation.id ? "blue" : "gray"}
                    justify="flex-start"
                    fullWidth
                    size="compact-sm"
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
                <Text size="xs" c="dimmed" ta="center" py="md">
                  No conversations yet.
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </Card>
      </GridCol>

      <GridCol span={{ base: 12, md: 9 }} style={{ minWidth: 0 }}>
        <Card withBorder radius="md" padding={0}>
          <Stack gap={0} h={{ base: 620, md: 640 }}>
            <Group px="md" py="sm" justify="space-between">
              <Group gap="xs">
                <ThemeIcon variant="light" radius="xl">
                  <Sparkles size={16} />
                </ThemeIcon>
                <Stack gap={0}>
                  <Text fw={700} size="sm">
                    {active?.title ?? "Task Copilot"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Writes always wait for your confirmation
                  </Text>
                </Stack>
              </Group>
              {loading && <Loader size="xs" />}
            </Group>
            <Divider />
            <ScrollArea
              viewportRef={messagesViewportRef}
              style={{ flex: 1 }}
              px="md"
              py="md"
            >
              <Stack gap="md">
                {active?.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onActionChange={updateAction}
                  />
                ))}
                {(!active || active.messages.length === 0) && (
                  <Stack align="center" justify="center" py="xl" gap="lg">
                    <ThemeIcon size={48} radius="xl" variant="light">
                      <Bot size={25} />
                    </ThemeIcon>
                    <Stack gap={4} align="center">
                      <Text fw={700}>What are you working on?</Text>
                      <Text size="sm" c="dimmed" ta="center" maw={520}>
                        Bring a half-formed idea, ask about your tasks, or
                        prepare a change. The copilot can read current task
                        state; anything it writes appears as a review card
                        first.
                      </Text>
                    </Stack>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" w="100%">
                      {STARTERS.map((starter) => (
                        <Button
                          key={starter}
                          variant="default"
                          size="sm"
                          h="auto"
                          py="xs"
                          onClick={() => sendMessage(starter)}
                        >
                          <Text size="xs" style={{ whiteSpace: "normal" }}>
                            {starter}
                          </Text>
                        </Button>
                      ))}
                    </SimpleGrid>
                  </Stack>
                )}
              </Stack>
            </ScrollArea>
            <Divider />
            <Group p="md" align="flex-end" wrap="nowrap">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Describe an idea or ask about your tasks…"
                autosize
                minRows={1}
                maxRows={5}
                maxLength={8_000}
                style={{ flex: 1 }}
                disabled={sending}
              />
              <Tooltip label="Send">
                <ActionIcon
                  size="lg"
                  aria-label="Send message"
                  loading={sending}
                  disabled={!draft.trim()}
                  onClick={() => sendMessage()}
                >
                  <Send size={17} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>
        </Card>
      </GridCol>
    </Grid>
  );
}
