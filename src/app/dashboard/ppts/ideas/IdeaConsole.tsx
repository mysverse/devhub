"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  ListItem,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { Clipboard, Lightbulb, Send, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getLinearProjects } from "@/app/dashboard/ppts/actions";
import EmptyState from "@/components/EmptyState";
import {
  ideaBlockedReason,
  ideaClipboardText,
  type PptRequestPrefill,
  pptRequestPrefillFromIdea,
  type TaskIdea,
} from "@/lib/task-idea";
import { generateTaskIdeas } from "./actions";

// Mounted only while open, like PptRequestButton — the modal keeps a lot of
// state and destroying it on close is what makes reopening with a different
// idea predictable.
const PptRequestModal = dynamic(
  () => import("@/app/dashboard/ppts/PptRequestModal"),
  { ssr: false },
);

type LinearTeam = { id: string; name: string; key: string };
type LinearProject = { id: string; name: string };

export default function IdeaConsole({
  teams,
  canPrompt,
}: {
  teams: LinearTeam[];
  /**
   * Whether the LLM adapter is configured. When it isn't, the prompt box is
   * hidden rather than disabled — same as the "Draft from issue" button, which
   * simply never appears — and the page still shows ranked board ideas.
   */
  canPrompt: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<TaskIdea[] | null>(null);
  const [llmUsed, setLlmUsed] = useState(false);
  const [generating, startGenerating] = useTransition();
  const [prefill, setPrefill] = useState<PptRequestPrefill | null>(null);

  function handleTeamChange(value: string | null) {
    setTeamId(value);
    setProjectId(null);
    setProjects([]);
    if (!value) return;
    startGenerating(async () => {
      const result = await getLinearProjects(value);
      if ("projects" in result) setProjects(result.projects);
    });
  }

  function handleGenerate() {
    startGenerating(async () => {
      const result = await generateTaskIdeas({
        prompt: prompt.trim() || undefined,
        teamId,
        teamName: teams.find((team) => team.id === teamId)?.name ?? null,
        projectId,
        projectName: projects.find((p) => p.id === projectId)?.name ?? null,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setIdeas(result.ideas);
      setLlmUsed(result.llmUsed);
      if (result.ideas.length === 0) {
        toast.info("Nothing to suggest right now.");
      }
    });
  }

  async function handleCopy(idea: TaskIdea) {
    try {
      await navigator.clipboard.writeText(ideaClipboardText(idea));
      toast.success("Copied — paste it into Linear as a normal issue.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  return (
    <Stack gap="xl">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          {canPrompt && (
            <Textarea
              label="What are you in the mood for?"
              description="Optional. Anything the board can't tell us — an area you want to learn, a size, a system you keep meaning to fix."
              placeholder="something small I can finish this week"
              autosize
              minRows={2}
              maxLength={600}
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
            />
          )}

          <Group grow align="flex-end">
            <Select
              label="Team"
              placeholder="Any team"
              clearable
              value={teamId}
              onChange={handleTeamChange}
              data={teams.map((team) => ({
                value: team.id,
                label: `${team.key} — ${team.name}`,
              }))}
            />
            <Select
              label="Project"
              placeholder={teamId ? "Any project" : "Pick a team first"}
              clearable
              disabled={!teamId || projects.length === 0}
              value={projectId}
              onChange={setProjectId}
              data={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
            />
          </Group>

          <Group justify="flex-end">
            <Button
              leftSection={<Sparkles size={14} />}
              loading={generating}
              onClick={handleGenerate}
            >
              {ideas ? "Suggest again" : "Suggest something"}
            </Button>
          </Group>
        </Stack>
      </Card>

      {ideas !== null && ideas.length === 0 && (
        <EmptyState
          icon={<Lightbulb size={26} />}
          title="Nothing to suggest right now"
          description="The board is empty and the backlog has nothing unassigned. That's usually a good sign."
        />
      )}

      {ideas !== null && ideas.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={700} fz="sm" tt="uppercase" c="dimmed">
              Ideas
            </Text>
            {!llmUsed && (
              <Text fz="xs" c="dimmed">
                Ranked from the open board
              </Text>
            )}
          </Group>

          {ideas.map((idea) => {
            const blocked = ideaBlockedReason(idea);
            const existing =
              idea.anchor.kind === "existing" ? idea.anchor : null;
            return (
              <Card key={idea.ref} withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Group
                    justify="space-between"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6}>
                        {existing ? (
                          <Badge size="sm" variant="light">
                            {existing.identifier}
                          </Badge>
                        ) : (
                          <Badge size="sm" variant="light" color="violet">
                            New idea
                          </Badge>
                        )}
                        <Badge size="sm" variant="light" color="gray">
                          {idea.estimate} pts
                        </Badge>
                        {idea.specialty && (
                          <Badge size="sm" variant="light" color="blue">
                            {idea.specialty.toLowerCase()}
                          </Badge>
                        )}
                      </Group>
                      <Text fw={600}>{idea.title}</Text>
                      <Text fz="xs" c="dimmed">
                        {idea.because}
                      </Text>
                    </Stack>
                  </Group>

                  <Text fz="sm">{idea.scope}</Text>

                  {idea.acceptanceCriteria.length > 0 && (
                    <List size="xs" spacing={2}>
                      {idea.acceptanceCriteria.map((criterion) => (
                        <ListItem key={criterion}>{criterion}</ListItem>
                      ))}
                    </List>
                  )}

                  {existing?.hasLiveBonusCandidate && (
                    <Alert color="yellow" variant="light" p="xs">
                      This issue currently has a potential bonus. Making it a
                      PPT replaces that — a PPT pays a guaranteed rate, a bonus
                      is a discretionary cap.
                    </Alert>
                  )}

                  <Group justify="flex-end" gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<Clipboard size={13} />}
                      onClick={() => handleCopy(idea)}
                    >
                      Copy for Linear
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Send size={13} />}
                      disabled={Boolean(blocked)}
                      title={blocked ?? undefined}
                      onClick={() =>
                        setPrefill(pptRequestPrefillFromIdea(idea))
                      }
                    >
                      Request as PPT
                    </Button>
                  </Group>

                  {blocked && (
                    <Text fz="xs" c="dimmed">
                      {blocked}
                    </Text>
                  )}
                </Stack>
              </Card>
            );
          })}

          <Text fz="xs" c="dimmed">
            &ldquo;Copy for Linear&rdquo; gives you the text to paste in as a
            normal issue &mdash; no PPT label, so it stays eligible for a bonus.
            Bonuses are decided after the work is done and are never guaranteed.
          </Text>
        </Stack>
      )}

      {prefill && (
        <PptRequestModal
          opened
          onClose={() => setPrefill(null)}
          prefill={prefill}
        />
      )}
    </Stack>
  );
}
