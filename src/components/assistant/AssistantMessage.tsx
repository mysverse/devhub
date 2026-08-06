"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clipboard,
  FilePenLine,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  RefreshCcw,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { SPRING } from "@/components/animations";
import MermaidDiagram from "@/components/MermaidDiagram";
import type {
  AssistantActionDto,
  AssistantMessageDto,
} from "@/lib/assistant-types";
import classes from "./AssistantExperience.module.css";

export type AssistantRunActivity = {
  id: string;
  name: string;
  phase: "running" | "complete" | "error";
  label: string;
  detail?: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Scope",
  body: "Message",
  note: "Note",
  dueDate: "Due date",
  estimate: "Complexity",
  assigneeIntent: "Assignee",
  mode: "Request type",
  reason: "Reason",
  projectName: "Project",
};

const STATUS_COPY = {
  PENDING: { label: "Review", color: "blue" },
  EXECUTING: { label: "Working", color: "yellow" },
  SUCCEEDED: { label: "Done", color: "green" },
  FAILED: { label: "Needs attention", color: "red" },
  CANCELLED: { label: "Cancelled", color: "gray" },
  EXPIRED: { label: "Expired", color: "gray" },
} as const;

function actionIcon(kind: string) {
  if (kind.includes("create") || kind.includes("ppt_request")) {
    return <Lightbulb size={17} />;
  }
  if (kind.includes("comment") || kind.includes("progress")) {
    return <MessageSquareText size={17} />;
  }
  if (kind.includes("update") || kind.includes("block")) {
    return <FilePenLine size={17} />;
  }
  return <ListChecks size={17} />;
}

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/date/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  if (key === "assigneeIntent") return text === "SELF" ? "Me" : "Open";
  if (key === "estimate") return `Level ${text}`;
  return text;
}

function payloadFields(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  return Object.entries(payload as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== "" &&
        !key.toLowerCase().endsWith("id") &&
        key !== "linearIssueIdentifier" &&
        key !== "linearIssueUrl",
    )
    .slice(0, 8);
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
  const status = STATUS_COPY[action.status];
  const fields = payloadFields(action.payload);

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
      }
      toast.success(decision === "confirm" ? "Done." : "Cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div layout transition={SPRING.soft} className={classes.actionCard}>
      <div className={classes.actionAccent} />
      <Stack gap="sm" p="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon variant="light" size="lg" radius="md">
              {actionIcon(action.kind)}
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Text fw={750} size="sm">
                {action.preview.title}
              </Text>
              <Text size="xs" c="dimmed" lh={1.45}>
                {action.preview.description}
              </Text>
            </Stack>
          </Group>
          <Badge
            color={status.color}
            variant="light"
            radius="sm"
            style={{ flexShrink: 0 }}
          >
            {status.label}
          </Badge>
        </Group>

        {fields.length > 0 && (
          <div className={classes.payloadGrid}>
            {fields.map(([key, value]) => {
              const wide = key === "description" || key === "body";
              const fieldClass = [classes.payloadField];
              if (wide) fieldClass.push(classes.payloadFieldWide);
              return (
                <div key={key} className={fieldClass.join(" ")}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, " $1")}
                  </Text>
                  <Text size="sm" mt={2} lineClamp={wide ? 4 : 2}>
                    {displayValue(key, value)}
                  </Text>
                </div>
              );
            })}
          </div>
        )}

        {action.preview.warning && (
          <Alert
            color="yellow"
            variant="light"
            icon={<CircleAlert size={15} />}
            py="xs"
          >
            <Text size="xs">{action.preview.warning}</Text>
          </Alert>
        )}

        {action.error && (
          <Alert color="red" variant="light" icon={<XCircle size={15} />}>
            <Text size="xs">{action.error}</Text>
          </Alert>
        )}

        <details className={classes.exactDetails}>
          <summary>View exact details</summary>
          <Code block mt="xs" style={{ maxHeight: 180, overflow: "auto" }}>
            {JSON.stringify(action.payload, null, 2)}
          </Code>
        </details>

        {pending && (
          <Group justify="space-between" align="center" gap="xs">
            <Group gap="xs">
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
                Not now
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Expires{" "}
              {new Date(action.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </Group>
        )}
      </Stack>
    </motion.div>
  );
}

function markdownSegments(content: string) {
  const segments: Array<
    { type: "markdown"; content: string } | { type: "mermaid"; content: string }
  > = [];
  const fence = String.fromCharCode(96).repeat(3);
  const pattern = new RegExp(
    `${fence}mermaid\\s*\\n([\\s\\S]*?)${fence}`,
    "gi",
  );
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({
        type: "markdown",
        content: content.slice(cursor, index),
      });
    }
    segments.push({ type: "mermaid", content: match[1].trim() });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) {
    segments.push({ type: "markdown", content: content.slice(cursor) });
  }
  return segments.length > 0
    ? segments
    : [{ type: "markdown" as const, content }];
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className={classes.markdown}>
      {markdownSegments(content).map((segment, index) =>
        segment.type === "mermaid" ? (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered content segments have no durable id
            key={index}
            className={classes.diagram}
          >
            <MermaidDiagram chart={segment.content} />
            <details className={classes.diagramSource}>
              <summary>View diagram source</summary>
              <Code block mt="xs">
                {segment.content}
              </Code>
            </details>
          </div>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: ordered content segments have no durable id
          <Fragment key={index}>
            <Markdown remarkPlugins={[remarkGfm]}>{segment.content}</Markdown>
          </Fragment>
        ),
      )}
    </div>
  );
}

function ActivityList({
  activities,
  providerTrail,
  complete,
}: {
  activities: AssistantRunActivity[];
  providerTrail: string[];
  complete: boolean;
}) {
  if (activities.length === 0 && providerTrail.length < 2) return null;
  const content = (
    <Stack gap={7}>
      {providerTrail.length > 1 && (
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon size="xs" radius="xl" color="yellow" variant="light">
            <RefreshCcw size={11} />
          </ThemeIcon>
          <Text size="xs" c="dimmed">
            Primary assistant paused. Backup took over.
          </Text>
        </Group>
      )}
      {activities.map((activity) => (
        <Group key={activity.id} gap="xs" wrap="nowrap" align="flex-start">
          {activity.phase === "running" ? (
            <Loader size={12} mt={3} />
          ) : activity.phase === "complete" ? (
            <CheckCircle2 size={14} color="var(--mantine-color-teal-4)" />
          ) : (
            <CircleAlert size={14} color="var(--mantine-color-yellow-4)" />
          )}
          <Stack gap={0}>
            <Text size="xs">{activity.label}</Text>
            {activity.detail && (
              <Text size="xs" c="dimmed">
                {activity.detail}
              </Text>
            )}
          </Stack>
        </Group>
      ))}
    </Stack>
  );

  if (complete) {
    const countLabel =
      activities.length +
      " " +
      (activities.length === 1 ? "check" : "checks") +
      " used";
    return (
      <details className={classes.activityRail}>
        <summary>{activities.length > 0 ? countLabel : "Backup used"}</summary>
        <div style={{ marginTop: 8 }}>{content}</div>
      </details>
    );
  }
  return <div className={classes.activityRail}>{content}</div>;
}

export function AssistantMessage({
  message,
  onActionChange,
  activities = [],
  providerTrail = [],
  onRetry,
}: {
  message: AssistantMessageDto;
  onActionChange: (action: AssistantActionDto) => void;
  activities?: AssistantRunActivity[];
  providerTrail?: string[];
  onRetry?: () => void;
}) {
  const assistant = message.role === "assistant";

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn’t copy that reply.");
    }
  }

  const rowClass = [classes.messageRow];
  if (!assistant) rowClass.push(classes.messageRowUser);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.soft}
      className={rowClass.join(" ")}
    >
      {assistant && (
        <ThemeIcon className={classes.assistantAvatar} radius="xl" size="md">
          <Bot size={15} />
        </ThemeIcon>
      )}
      <div className={classes.bubble}>
        <div
          className={assistant ? classes.assistantBubble : classes.userBubble}
        >
          {message.content ? (
            assistant ? (
              <AssistantMarkdown content={message.content} />
            ) : (
              <Text size="sm" lh={1.55}>
                {message.content}
              </Text>
            )
          ) : message.status === "PENDING" ? (
            <Group gap="xs">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles size={16} color="var(--mantine-color-blue-3)" />
              </motion.div>
              <Text size="sm" c="dimmed">
                Thinking it through…
              </Text>
            </Group>
          ) : null}

          <AnimatePresence initial={false}>
            {(activities.length > 0 || providerTrail.length > 1) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <ActivityList
                  activities={activities}
                  providerTrail={providerTrail}
                  complete={message.status !== "PENDING"}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {message.status === "FAILED" && (
            <Alert color="red" variant="light" mt="sm" py="xs">
              <Group justify="space-between" gap="xs">
                <Text size="xs">I couldn’t finish that reply.</Text>
                {onRetry && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="red"
                    leftSection={<RefreshCcw size={12} />}
                    onClick={onRetry}
                  >
                    Try again
                  </Button>
                )}
              </Group>
            </Alert>
          )}
          {message.status === "INTERRUPTED" && (
            <Group gap="xs" mt="xs">
              <CircleDashed size={13} />
              <Text size="xs" c="dimmed">
                Stopped early.
              </Text>
            </Group>
          )}

          {message.actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onChange={onActionChange}
            />
          ))}
        </div>

        {message.content && (
          <Group
            className={classes.messageMeta}
            justify={assistant ? "flex-start" : "flex-end"}
            gap={4}
            mt={3}
          >
            <Text size="xs" c="dimmed">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {assistant && (
              <Tooltip label="Copy reply">
                <ActionIcon
                  size="xs"
                  color="gray"
                  variant="subtle"
                  aria-label="Copy reply"
                  onClick={copyMessage}
                >
                  <Clipboard size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}
      </div>
      {!assistant && (
        <ThemeIcon
          className={classes.userAvatar}
          variant="light"
          color="gray"
          radius="xl"
          size="md"
        >
          <UserRound size={15} />
        </ThemeIcon>
      )}
    </motion.div>
  );
}
