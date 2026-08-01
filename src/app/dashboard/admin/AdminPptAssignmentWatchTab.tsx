"use client";

import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  Bell,
  ExternalLink,
  PauseCircle,
  RotateCcw,
  Search,
  UserX,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";
import { PPT_ASSIGNMENT_WATCH_STATUS, statusCopy } from "@/lib/status-copy";
import {
  forceUnassignPptAssignmentWatch,
  markPptAssignmentWatchActive,
  snoozePptAssignmentWatch,
} from "./ppt-assignment-watch-actions";

export type AdminPptAssignmentWatchRow = {
  id: string;
  linearIssueId: string;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
  linearIssueUrl: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  developerName: string | null;
  status: string;
  assignedAt: string;
  lastActivityAt: string;
  warnedAt: string | null;
  unassignedAt: string | null;
  snoozedUntil: string | null;
  snoozeReason: string | null;
  warningCount: number;
  warningAt: string;
  unassignAt: string;
  staleHours: number;
  dueWithin24Hours: boolean;
  selfBlockCount: number;
  selfBlockReasonLabel: string | null;
  selfBlockNote: string | null;
  selfBlockExpiresAt: string | null;
  releasedBySelfAt: string | null;
  reassignReason: string | null;
  lastAdminActionAt: string | null;
  lastAdminActionByName: string | null;
  lastAdminActionNote: string | null;
};

type WatchAction = "force-unassign" | "snooze" | "mark-active";

const actionCopy: Record<WatchAction, { title: string; label: string }> = {
  "force-unassign": {
    title: "Force Unassign",
    label: "Force unassign",
  },
  snooze: {
    title: "Snooze 72h",
    label: "Snooze 72h",
  },
  "mark-active": {
    title: "Mark Active",
    label: "Mark active",
  },
};

function issueTitle(row: AdminPptAssignmentWatchRow) {
  return row.linearIssueIdentifier
    ? `${row.linearIssueIdentifier} - ${row.linearIssueTitle ?? "PPT task"}`
    : (row.linearIssueTitle ?? "PPT task");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatHours(hours: number) {
  const rounded =
    Math.abs(hours) < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  if (hours < 0) return `${Math.abs(rounded)}h left`;
  return `${rounded}h stale`;
}

function isOpenStatus(status: string) {
  return ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED", "UNASSIGNED"].includes(
    status,
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card withBorder radius="md" padding="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text size="xl" fw={800} c={color}>
        {value}
      </Text>
    </Card>
  );
}

export default function AdminPptAssignmentWatchTab({
  watches,
}: {
  watches: AdminPptAssignmentWatchRow[];
}) {
  const [mode, setMode] = useState<"open" | "history" | "developers">("open");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    action: WatchAction;
    row: AdminPptAssignmentWatchRow;
  } | null>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const open = watches.filter((watch) => isOpenStatus(watch.status));
    return {
      active: open.filter((watch) =>
        ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"].includes(watch.status),
      ).length,
      warned: watches.filter((watch) => watch.status === "WARNED").length,
      blocked: watches.filter((watch) => watch.status === "BLOCKED").length,
      snoozed: watches.filter((watch) => watch.status === "SNOOZED").length,
      unassigned: watches.filter((watch) => watch.status === "UNASSIGNED")
        .length,
      dueSoon: open.filter((watch) => watch.dueWithin24Hours).length,
    };
  }, [watches]);

  const developerRollup = useMemo(() => {
    type Rollup = {
      key: string;
      name: string;
      email: string | null;
      activeCount: number;
      oldestAssignedAt: string | null;
      warnings: number;
      blocks: number;
      selfReleases: number;
      takeovers: number;
    };
    const byDeveloper = new Map<string, Rollup>();
    for (const watch of watches) {
      const key = watch.assigneeEmail ?? watch.developerName ?? watch.id;
      const entry = byDeveloper.get(key) ?? {
        key,
        name: watch.developerName ?? watch.assigneeName ?? "Unknown developer",
        email: watch.assigneeEmail,
        activeCount: 0,
        oldestAssignedAt: null,
        warnings: 0,
        blocks: 0,
        selfReleases: 0,
        takeovers: 0,
      };
      const isActive = ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED"].includes(
        watch.status,
      );
      if (isActive) {
        entry.activeCount++;
        if (
          !entry.oldestAssignedAt ||
          watch.assignedAt < entry.oldestAssignedAt
        ) {
          entry.oldestAssignedAt = watch.assignedAt;
        }
      }
      entry.warnings += watch.warningCount;
      entry.blocks += watch.selfBlockCount;
      if (watch.releasedBySelfAt) entry.selfReleases++;
      if (watch.reassignReason) entry.takeovers++;
      byDeveloper.set(key, entry);
    }
    return [...byDeveloper.values()].sort(
      (a, b) => b.activeCount - a.activeCount || b.warnings - a.warnings,
    );
  }, [watches]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return watches.filter((watch) => {
      if (mode === "open" && !isOpenStatus(watch.status)) return false;
      if (mode === "history" && watch.status !== "RESOLVED") return false;
      if (!needle) return true;
      return [
        watch.linearIssueIdentifier,
        watch.linearIssueTitle,
        watch.assigneeName,
        watch.assigneeEmail,
        watch.developerName,
        watch.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [mode, query, watches]);

  function openAction(action: WatchAction, row: AdminPptAssignmentWatchRow) {
    setSelected({ action, row });
    setNote("");
  }

  async function runAction() {
    if (!selected) return;
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error("Add an admin note first");
      return;
    }

    startTransition(async () => {
      const result =
        selected.action === "force-unassign"
          ? await forceUnassignPptAssignmentWatch(selected.row.id, trimmed)
          : selected.action === "snooze"
            ? await snoozePptAssignmentWatch(selected.row.id, trimmed)
            : await markPptAssignmentWatchActive(selected.row.id, trimmed);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`${actionCopy[selected.action].label} applied`);
      setSelected(null);
      setNote("");
    });
  }

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 6 }} spacing="sm">
        <SummaryCard label="Watched" value={summary.active} color="blue" />
        <SummaryCard label="Warned" value={summary.warned} color="yellow" />
        <SummaryCard label="Blocked" value={summary.blocked} color="orange" />
        <SummaryCard label="Snoozed" value={summary.snoozed} color="violet" />
        <SummaryCard
          label="Unassigned"
          value={summary.unassigned}
          color="orange"
        />
        <SummaryCard label="Due <24h" value={summary.dueSoon} color="red" />
      </SimpleGrid>

      <Group justify="space-between" align="center">
        <SegmentedControl
          value={mode}
          onChange={(value) =>
            setMode(value as "open" | "history" | "developers")
          }
          data={[
            { label: "Open", value: "open" },
            { label: "History", value: "history" },
            { label: "By developer", value: "developers" },
          ]}
        />
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search issue or assignee"
          leftSection={<Search size={15} />}
          style={{ minWidth: 260 }}
        />
      </Group>

      {mode === "developers" && (
        <Card withBorder radius="md" padding={0}>
          <ScrollArea>
            <Table miw={760} verticalSpacing="sm" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>Developer</TableTh>
                  <TableTh>Active tasks</TableTh>
                  <TableTh>Oldest active claim</TableTh>
                  <TableTh>Warnings</TableTh>
                  <TableTh>Blocks</TableTh>
                  <TableTh>Self-releases</TableTh>
                  <TableTh>Takeovers</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {developerRollup.map((entry) => (
                  <TableTr key={entry.key}>
                    <TableTd>
                      <Stack gap={2}>
                        <Text size="sm" fw={600}>
                          {entry.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {entry.email ?? "-"}
                        </Text>
                      </Stack>
                    </TableTd>
                    <TableTd>
                      <Badge
                        variant="light"
                        color={
                          entry.activeCount >= 5
                            ? "orange"
                            : entry.activeCount >= 3
                              ? "yellow"
                              : "blue"
                        }
                      >
                        {entry.activeCount}
                      </Badge>
                    </TableTd>
                    <TableTd>{formatDate(entry.oldestAssignedAt)}</TableTd>
                    <TableTd>{entry.warnings}</TableTd>
                    <TableTd>{entry.blocks}</TableTd>
                    <TableTd>{entry.selfReleases}</TableTd>
                    <TableTd>{entry.takeovers}</TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </ScrollArea>
          {developerRollup.length === 0 && (
            <Stack align="center" py="xl" gap="xs">
              <Bell size={20} />
              <Text c="dimmed">No watch data yet.</Text>
            </Stack>
          )}
        </Card>
      )}

      {mode !== "developers" && (
        <Card withBorder radius="md" padding={0}>
          <ScrollArea>
            <Table miw={1180} verticalSpacing="sm" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>Status</TableTh>
                  <TableTh>Issue</TableTh>
                  <TableTh>Assignee</TableTh>
                  <TableTh>Assigned</TableTh>
                  <TableTh>Last Activity</TableTh>
                  <TableTh>Stale Age</TableTh>
                  <TableTh>Warn At</TableTh>
                  <TableTh>Unassign At</TableTh>
                  <TableTh>Snoozed Until</TableTh>
                  <TableTh>Warnings</TableTh>
                  <TableTh>Actions</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {visibleRows.map((row) => {
                  const status = statusCopy(
                    PPT_ASSIGNMENT_WATCH_STATUS,
                    row.status,
                  );
                  const actionsDisabled =
                    row.status === "UNASSIGNED" || row.status === "RESOLVED";
                  return (
                    <TableTr key={row.id}>
                      <TableTd>
                        <Stack gap={4}>
                          <StatusBadge copy={status} size="sm" />
                          {row.dueWithin24Hours && (
                            <Badge size="xs" color="red" variant="light">
                              Due soon
                            </Badge>
                          )}
                          {row.status === "BLOCKED" && (
                            <Text size="xs" c="orange.4" lineClamp={2}>
                              {row.selfBlockReasonLabel ?? "Blocked"}
                              {row.selfBlockNote
                                ? ` — ${row.selfBlockNote}`
                                : ""}
                              {row.selfBlockExpiresAt
                                ? ` (until ${formatDate(row.selfBlockExpiresAt)})`
                                : ""}
                            </Text>
                          )}
                          {row.selfBlockCount >= 2 && (
                            <Badge size="xs" color="yellow" variant="light">
                              {row.selfBlockCount}× blocked
                            </Badge>
                          )}
                        </Stack>
                      </TableTd>
                      <TableTd>
                        <Stack gap={2}>
                          <Group gap="xs" wrap="nowrap">
                            <Text fw={700} lineClamp={1}>
                              {issueTitle(row)}
                            </Text>
                            {row.linearIssueUrl && (
                              <Anchor href={row.linearIssueUrl} target="_blank">
                                <ExternalLink size={14} />
                              </Anchor>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {row.linearIssueId}
                          </Text>
                        </Stack>
                      </TableTd>
                      <TableTd>
                        <Stack gap={2}>
                          <Text size="sm" fw={600}>
                            {row.developerName ||
                              row.assigneeName ||
                              "Unknown developer"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {row.assigneeEmail ?? "-"}
                          </Text>
                        </Stack>
                      </TableTd>
                      <TableTd>{formatDate(row.assignedAt)}</TableTd>
                      <TableTd>{formatDate(row.lastActivityAt)}</TableTd>
                      <TableTd>
                        <Text size="sm" fw={600}>
                          {formatHours(row.staleHours)}
                        </Text>
                      </TableTd>
                      <TableTd>{formatDate(row.warningAt)}</TableTd>
                      <TableTd>{formatDate(row.unassignAt)}</TableTd>
                      <TableTd>
                        <Stack gap={2}>
                          <Text size="sm">{formatDate(row.snoozedUntil)}</Text>
                          {row.snoozeReason && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {row.snoozeReason}
                            </Text>
                          )}
                        </Stack>
                      </TableTd>
                      <TableTd>{row.warningCount}</TableTd>
                      <TableTd>
                        <Group gap={4} wrap="nowrap">
                          <Tooltip label="Force unassign">
                            <ActionIcon
                              variant="subtle"
                              color="orange"
                              disabled={actionsDisabled}
                              onClick={() => openAction("force-unassign", row)}
                            >
                              <UserX size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Snooze 72h">
                            <ActionIcon
                              variant="subtle"
                              color="violet"
                              disabled={actionsDisabled}
                              onClick={() => openAction("snooze", row)}
                            >
                              <PauseCircle size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Mark active">
                            <ActionIcon
                              variant="subtle"
                              color="blue"
                              disabled={actionsDisabled}
                              onClick={() => openAction("mark-active", row)}
                            >
                              <RotateCcw size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </ScrollArea>
          {visibleRows.length === 0 && (
            <Stack align="center" py="xl" gap="xs">
              <Bell size={20} />
              <Text c="dimmed">No assignment watches match this view.</Text>
            </Stack>
          )}
        </Card>
      )}

      <Modal
        opened={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? actionCopy[selected.action].title : ""}
        centered
      >
        <Stack gap="sm">
          {selected && (
            <Text size="sm" c="dimmed">
              {issueTitle(selected.row)}
            </Text>
          )}
          <Textarea
            label="Admin note"
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            minRows={4}
            autosize
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              color={selected?.action === "force-unassign" ? "orange" : "blue"}
              loading={isPending}
              onClick={runAction}
            >
              {selected ? actionCopy[selected.action].label : "Apply"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
