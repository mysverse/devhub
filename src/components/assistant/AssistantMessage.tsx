"use client";

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Group,
  Image,
  Loader,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clipboard,
  ExternalLink,
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
import CampaignBadge from "@/components/CampaignBadge";
import MermaidDiagram from "@/components/MermaidDiagram";
import type {
  AssistantActionDto,
  AssistantLinearIssueReference,
  AssistantMessageDto,
  AssistantReferenceDto,
} from "@/lib/assistant-types";
import classes from "./AssistantExperience.module.css";
import { assistantReplySuggestions } from "./assistant-suggestions";

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

function payloadFields(kind: string, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([key, value]) =>
      value !== null &&
      value !== "" &&
      key !== "title" &&
      key !== "mode" &&
      !key.toLowerCase().endsWith("id") &&
      key !== "linearIssueIdentifier" &&
      key !== "linearIssueUrl",
  );
  if (kind === "ppt_request") {
    const preferred = [
      "projectName",
      "dueDate",
      "estimate",
      "assigneeIntent",
      "description",
    ];
    return preferred.flatMap((key) => {
      const entry = entries.find(([candidate]) => candidate === key);
      return entry ? [entry] : [];
    });
  }
  return entries.slice(0, 6);
}

function actionCtaLabel(kind: string): string {
  if (kind === "ppt_request") return "Submit PPT request";
  if (kind === "create_bonus_task") return "Create bonus-path task";
  if (kind === "create_task") return "Create Linear task";
  return "Confirm";
}

function TaskDraftCard({
  draft,
  conversationId,
  onActionCreated,
}: {
  draft: Extract<AssistantReferenceDto, { kind: "task_draft" }>;
  conversationId: string;
  onActionCreated: (action: AssistantActionDto) => void;
}) {
  const [busyRoute, setBusyRoute] = useState<string | null>(null);

  async function convertRoute(route: "PPT" | "TASK" | "BONUS") {
    setBusyRoute(route);
    try {
      const response = await fetch("/api/assistant/drafts/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, route, draft }),
      });
      const data = (await response.json()) as {
        action?: AssistantActionDto;
        error?: string;
      };
      if (!response.ok || !data.action || data.error) {
        throw new Error(data.error ?? "Conversion failed.");
      }
      onActionCreated(data.action);
      toast.success(
        route === "PPT"
          ? "Prepared PPT request card."
          : route === "BONUS"
            ? "Prepared bonus-path task card."
            : "Prepared Linear task card.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Draft conversion failed.",
      );
    } finally {
      setBusyRoute(null);
    }
  }

  return (
    <motion.div layout transition={SPRING.soft} className={classes.draftCard}>
      <div className={classes.draftAccent} />
      <Stack gap="xs" p="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Sparkles size={16} color="var(--mantine-color-grape-4)" />
            <Text fw={750} size="sm">
              Structured Task Draft
            </Text>
          </Group>
          <Badge color="grape" variant="light" size="xs">
            Draft
          </Badge>
        </Group>

        <Text size="md" fw={700} c="white">
          {draft.title}
        </Text>

        <Text size="sm" c="gray.3" lh={1.5}>
          {draft.scope}
        </Text>

        {draft.acceptanceCriteria.length > 0 && (
          <Stack gap={3}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Acceptance Criteria
            </Text>
            {draft.acceptanceCriteria.map((criterion) => (
              <Group key={criterion} gap={6} align="flex-start" wrap="nowrap">
                <Check
                  size={13}
                  color="var(--mantine-color-green-4)"
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <Text size="xs" c="gray.2">
                  {criterion}
                </Text>
              </Group>
            ))}
          </Stack>
        )}

        <Group gap="xs" mt={4} wrap="wrap">
          <Badge size="xs" variant="outline" color="blue">
            Level {draft.complexity}
          </Badge>
          <Badge size="xs" variant="outline" color="gray">
            Target: {draft.targetDate}
          </Badge>
          {draft.provenance?.complexity === "INFERRED" && (
            <Badge
              size="xs"
              variant="dot"
              color="yellow"
              className={classes.provenanceBadge}
            >
              Suggested Complexity
            </Badge>
          )}
          {draft.provenance?.targetDate === "INFERRED" && (
            <Badge
              size="xs"
              variant="dot"
              color="yellow"
              className={classes.provenanceBadge}
            >
              Suggested Date
            </Badge>
          )}
        </Group>

        <Group gap="xs" mt="sm">
          <Button
            size="xs"
            color="blue"
            loading={busyRoute === "PPT"}
            onClick={() => convertRoute("PPT")}
          >
            Request PPT
          </Button>
          <Button
            size="xs"
            color="indigo"
            variant="light"
            loading={busyRoute === "TASK"}
            onClick={() => convertRoute("TASK")}
          >
            Create Task
          </Button>
          <Button
            size="xs"
            color="grape"
            variant="light"
            loading={busyRoute === "BONUS"}
            onClick={() => convertRoute("BONUS")}
          >
            Make Bonus-Eligible
          </Button>
        </Group>
      </Stack>
    </motion.div>
  );
}

function ActionCard({
  action,
  onChange,
}: {
  action: AssistantActionDto;
  onChange: (action: AssistantActionDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const pending = action.status === "PENDING";
  const succeeded = action.status === "SUCCEEDED";
  const status = STATUS_COPY[action.status];
  const fields = payloadFields(action.kind, action.payload);

  const payloadObj = (action.payload ?? {}) as Record<string, unknown>;
  const [editTitle, setEditTitle] = useState(String(payloadObj.title ?? ""));
  const [editDueDate, setEditDueDate] = useState(
    String(payloadObj.dueDate ?? ""),
  );
  const [editEstimate, setEditEstimate] = useState<number>(
    Number(payloadObj.estimate ?? 3),
  );
  const [editDescription, setEditDescription] = useState(
    String(payloadObj.description ?? ""),
  );

  async function saveInlineEdit() {
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/assistant/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          dueDate: editDueDate || null,
          estimate: editEstimate,
          description: editDescription || null,
        }),
      });
      const data = (await response.json()) as {
        action?: AssistantActionDto;
        error?: string;
      };
      if (!response.ok || data.error || !data.action) {
        throw new Error(data.error ?? "Could not save edits.");
      }
      onChange(data.action);
      setEditing(false);
      toast.success("Card updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingEdit(false);
    }
  }

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

  const resultObj = (action.result ?? {}) as Record<string, unknown>;
  const createdIssue = resultObj.issue as
    | { url?: string; identifier?: string }
    | undefined;

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
          <Group gap={6} style={{ flexShrink: 0 }}>
            {pending && !editing && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                aria-label="Edit card"
                onClick={() => setEditing(true)}
              >
                <FilePenLine size={14} />
              </ActionIcon>
            )}
            <Badge color={status.color} variant="light" radius="sm">
              {status.label}
            </Badge>
          </Group>
        </Group>

        {action.kind === "ppt_request" && action.preview.payout && (
          <div className={classes.actionPayout}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={750}>
                  Projected payout
                </Text>
                <Text
                  size="xl"
                  fw={850}
                  c={
                    action.preview.payout.campaign
                      ? action.preview.payout.campaign.accentColor
                      : "green"
                  }
                >
                  {action.preview.payout.amountLabel}
                </Text>
              </Stack>
              {action.preview.payout.campaign && (
                <CampaignBadge campaign={action.preview.payout.campaign} />
              )}
            </Group>
            <Text size="xs" c="dimmed" mt={5} lh={1.45}>
              {action.preview.payout.campaign
                ? `Normally ${action.preview.payout.baseLabel}. ${action.preview.payout.multiplier}x applies if approved and payable before ${new Date(
                    action.preview.payout.campaign.endsAt,
                  ).toLocaleString()}.`
                : `Based on your current ${action.preview.payout.currency} rate.`}
            </Text>
          </div>
        )}

        {editing ? (
          <div className={classes.inlineEditor}>
            <Stack gap="xs">
              <Text size="xs" fw={750} c="blue.3">
                Edit Card Values
              </Text>
              <TextInput
                size="xs"
                label="Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.currentTarget.value)}
              />
              <Group grow gap="xs">
                <TextInput
                  size="xs"
                  label="Due Date (YYYY-MM-DD)"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.currentTarget.value)}
                />
                <NumberInput
                  size="xs"
                  label="Complexity (1-5)"
                  min={1}
                  max={5}
                  value={editEstimate}
                  onChange={(val) => setEditEstimate(Number(val ?? 3))}
                />
              </Group>
              <Textarea
                size="xs"
                label="Scope / Description"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.currentTarget.value)}
              />
              <Group justify="flex-end" gap="xs" mt={4}>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="blue"
                  loading={savingEdit}
                  onClick={saveInlineEdit}
                >
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </div>
        ) : (
          fields.length > 0 && (
            <div className={classes.payloadGrid}>
              {fields.map(([key, value]) => {
                const wide = key === "description" || key === "body";
                const fieldClass = [classes.payloadField];
                if (wide) fieldClass.push(classes.payloadFieldWide);
                return (
                  <div key={key} className={fieldClass.join(" ")}>
                    <Group justify="space-between" align="center">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        {FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, " $1")}
                      </Text>
                    </Group>
                    <Text size="sm" mt={2} lineClamp={wide ? 4 : 2}>
                      {displayValue(key, value)}
                    </Text>
                  </div>
                );
              })}
            </div>
          )
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

        {pending && !editing && (
          <Group justify="space-between" align="center" gap="xs">
            <Group gap="xs">
              <Button
                size="xs"
                leftSection={<Check size={14} />}
                loading={busy}
                onClick={() => decide("confirm")}
              >
                {actionCtaLabel(action.kind)}
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

        {succeeded && (
          <Group gap="xs" mt="xs">
            {createdIssue?.url && (
              <Anchor
                href={createdIssue.url}
                target="_blank"
                rel="noreferrer"
                size="xs"
                fw={700}
                c="blue"
              >
                Open in Linear ({createdIssue.identifier})
              </Anchor>
            )}
            {action.kind === "ppt_request" && (
              <Anchor href="/dashboard/ppts" size="xs" fw={700} c="blue">
                View PPT requests
              </Anchor>
            )}
            {action.kind === "create_bonus_task" && (
              <Anchor href="/dashboard/bonuses" size="xs" fw={700} c="grape">
                View bonuses
              </Anchor>
            )}
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

function LinearIssueCard({
  reference,
}: {
  reference: AssistantLinearIssueReference;
}) {
  const imageUrl = reference.imageUrl
    ? `/api/image-proxy?url=${encodeURIComponent(reference.imageUrl)}`
    : null;
  return (
    <Anchor
      className={classes.linearReference}
      href={reference.url}
      target="_blank"
      rel="noreferrer"
      underline="never"
      aria-label={`Open ${reference.identifier} in Linear`}
      data-testid="linear-task-reference"
    >
      {imageUrl && (
        <Image
          className={classes.linearReferenceImage}
          src={imageUrl}
          alt=""
          height={96}
        />
      )}
      <Stack gap={6} p="sm" style={{ minWidth: 0 }}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={5} wrap="wrap">
            <Badge size="xs" variant="light" color="blue">
              {reference.identifier}
            </Badge>
            <Badge size="xs" variant="dot" color="gray">
              {reference.stateName}
            </Badge>
            {reference.estimate !== null && (
              <Badge size="xs" variant="outline" color="grape">
                Level {reference.estimate}
              </Badge>
            )}
          </Group>
          <ExternalLink
            size={14}
            color="var(--mantine-color-dimmed)"
            style={{ flexShrink: 0 }}
          />
        </Group>
        <Text size="sm" fw={750} c="bright" lh={1.35}>
          {reference.title}
        </Text>
        {reference.payout && (
          <div className={classes.linearReferencePayout}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Stack gap={1} style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={750}>
                  Projected payout
                </Text>
                <Text
                  size="lg"
                  fw={850}
                  c={
                    reference.payout.campaign
                      ? reference.payout.campaign.accentColor
                      : "green"
                  }
                  data-testid="linear-task-payout"
                >
                  {reference.payout.amountLabel}
                </Text>
              </Stack>
              {reference.payout.campaign && (
                <CampaignBadge campaign={reference.payout.campaign} />
              )}
            </Group>
            {reference.payout.campaign && (
              <Text size="xs" c="dimmed" mt={3}>
                Normally {reference.payout.baseLabel}
              </Text>
            )}
          </div>
        )}
        {reference.description && (
          <Text size="xs" c="dimmed" lineClamp={2} lh={1.45}>
            {reference.description}
          </Text>
        )}
        {reference.labelNames.length > 0 && (
          <Group gap={5}>
            {reference.labelNames.slice(0, 3).map((label) => (
              <Badge key={label} size="xs" variant="outline" color="gray">
                {label}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Anchor>
  );
}

function MessageReferences({
  references,
  conversationId,
  onActionChange,
}: {
  references: AssistantReferenceDto[];
  conversationId: string;
  onActionChange: (action: AssistantActionDto) => void;
}) {
  if (!references || references.length === 0) return null;
  const visible = references.slice(0, 4);
  const rest = references.slice(4);
  return (
    <Stack gap={8} mt="sm">
      {visible.map((reference) =>
        reference.kind === "task_draft" ? (
          <TaskDraftCard
            key={reference.id}
            draft={reference}
            conversationId={conversationId}
            onActionCreated={onActionChange}
          />
        ) : (
          <LinearIssueCard key={reference.id} reference={reference} />
        ),
      )}
      {rest.length > 0 && (
        <details className={classes.moreReferences}>
          <summary>
            Show {rest.length} more {rest.length === 1 ? "item" : "items"}
          </summary>
          <Stack gap={8} mt={8}>
            {rest.map((reference) =>
              reference.kind === "task_draft" ? (
                <TaskDraftCard
                  key={reference.id}
                  draft={reference}
                  conversationId={conversationId}
                  onActionCreated={onActionChange}
                />
              ) : (
                <LinearIssueCard key={reference.id} reference={reference} />
              ),
            )}
          </Stack>
        </details>
      )}
    </Stack>
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
  onPrompt,
}: {
  message: AssistantMessageDto;
  onActionChange: (action: AssistantActionDto) => void;
  activities?: AssistantRunActivity[];
  providerTrail?: string[];
  onRetry?: () => void;
  onPrompt?: (prompt: string) => void;
}) {
  const assistant = message.role === "assistant";
  const suggestions = assistantReplySuggestions(message);

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

          <MessageReferences
            references={message.references}
            conversationId={message.conversationId}
            onActionChange={onActionChange}
          />

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

          {onPrompt && suggestions.length > 0 && (
            <Group gap={6} mt="sm">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  size="compact-xs"
                  variant="light"
                  color={suggestion.includes("PPT") ? "blue" : "gray"}
                  rightSection={<ArrowRight size={11} />}
                  onClick={() => onPrompt(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </Group>
          )}
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
