"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import dayjs from "dayjs";
import { Send } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getSuggestionCandidates,
  type SuggestableDeveloper,
  suggestTaskToDeveloper,
} from "@/app/dashboard/admin/task-suggestion-actions";
import AiAssistField from "@/components/ai-assist/AiAssistField";
import EmptyState from "@/components/EmptyState";

type SuggestTask = {
  id: string;
  identifier: string;
  title: string;
  estimate: number | null;
};

type RecentSuggestion = {
  id: string;
  identifier: string;
  title: string;
  developerName: string;
  reason: string;
  outcome: string;
  createdAt: string;
};

const OUTCOME_COPY: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Waiting", color: "gray" },
  CLAIMED: { label: "Claimed it", color: "green" },
  TAKEN: { label: "Someone else took it", color: "yellow" },
  EXPIRED: { label: "No response", color: "red" },
};

/**
 * The push side of the board: pick an open task, see who it suits and why,
 * send it to one person. The ranking is advice — every developer stays
 * selectable, because an admin knows things the ranker doesn't.
 */
export default function SuggestTaskConsole({
  tasks,
  recent,
  linearConfigured,
}: {
  tasks: SuggestTask[];
  recent: RecentSuggestion[];
  linearConfigured: boolean;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SuggestableDeveloper[]>([]);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  function handleTaskChange(value: string | null) {
    setTaskId(value);
    setDeveloperId(null);
    setCandidates([]);
    if (!value) return;

    startLoading(async () => {
      const result = await getSuggestionCandidates(value);
      setCandidates(result);
      // Best match preselected, but only as a starting point.
      setDeveloperId(result.find((c) => !c.alreadySuggested)?.id ?? null);
    });
  }

  function handleSend() {
    if (!taskId || !developerId) return;
    startSending(async () => {
      const result = await suggestTaskToDeveloper({
        issueId: taskId,
        userId: developerId,
        note: note.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Suggestion sent");
      setNote("");
      handleTaskChange(taskId);
    });
  }

  const selected = candidates.find((c) => c.id === developerId);

  if (!linearConfigured) {
    return (
      <Alert color="yellow" title="Linear isn't configured">
        Suggestions read the open board from Linear, so this needs
        LINEAR_SERVICE_API_KEY set.
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Select
            label="Open task"
            placeholder={
              tasks.length ? "Pick a task to suggest" : "No unclaimed tasks"
            }
            disabled={tasks.length === 0}
            searchable
            value={taskId}
            onChange={handleTaskChange}
            data={tasks.map((task) => ({
              value: task.id,
              label: `${task.identifier} — ${task.title}${
                task.estimate ? ` (${task.estimate} pts)` : ""
              }`,
            }))}
          />

          <Select
            label="Developer"
            description="Ranked by how well the task matches them. Reasons come from the same ranker developers see."
            placeholder={
              loading ? "Working out who this suits..." : "Pick a developer"
            }
            disabled={!taskId || loading || candidates.length === 0}
            value={developerId}
            onChange={setDeveloperId}
            data={candidates.map((candidate) => ({
              value: candidate.id,
              label: candidate.alreadySuggested
                ? `${candidate.name} — already waiting on this`
                : `${candidate.name} — ${candidate.because}`,
              disabled: candidate.alreadySuggested,
            }))}
          />

          {selected && (
            <Alert color="blue" variant="light" title="They'll be told">
              {selected.because}
            </Alert>
          )}

          <div>
            <Textarea
              ref={noteRef}
              label="Note (optional)"
              description="Anything the ranker can't know — context, urgency, who to ask."
              autosize
              minRows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
            <AiAssistField
              fieldId="task_suggestion_note"
              value={note}
              onChange={setNote}
              textareaRef={noteRef}
              disabled={sending}
            />
          </div>

          <Group justify="flex-end">
            <Button
              leftSection={<Send size={14} />}
              disabled={!taskId || !developerId}
              loading={sending}
              onClick={handleSend}
            >
              Send suggestion
            </Button>
          </Group>
        </Stack>
      </Card>

      <Stack gap="sm">
        <Text fw={700} fz="sm" tt="uppercase" c="dimmed">
          Recent suggestions
        </Text>
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing suggested yet"
            description="Suggestions show up here with whether the developer picked the task up — the only read on whether pushing work at people actually works."
          />
        ) : (
          recent.map((suggestion) => {
            const outcome = OUTCOME_COPY[suggestion.outcome] ?? {
              label: suggestion.outcome,
              color: "gray",
            };
            return (
              <Card key={suggestion.id} withBorder radius="md" padding="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text fz="sm" fw={600}>
                      {suggestion.identifier} — {suggestion.title}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      to {suggestion.developerName} · {suggestion.reason}
                    </Text>
                  </Stack>
                  <Stack gap={2} align="flex-end">
                    <Badge size="sm" variant="light" color={outcome.color}>
                      {outcome.label}
                    </Badge>
                    <Text fz="xs" c="dimmed">
                      {dayjs(suggestion.createdAt).format("D MMM")}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}
