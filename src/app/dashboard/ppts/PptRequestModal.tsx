"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  StepperStep,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Search,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SPRING, StepTransition } from "@/components/animations";
import { signIn } from "@/lib/auth-client";
import { estimateToAmount, formatAmount } from "@/lib/currency";
import {
  getLinearProjects,
  getLinearTeams,
  searchLinearIssues,
  submitPptRequest,
} from "./actions";

type LinearTeam = { id: string; name: string; key: string };
type LinearProject = { id: string; name: string };
type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  teamId: string;
  stateType: string;
  stateName: string;
  estimate: number | null;
  hasPptLabel: boolean;
  hasExistingRequest: boolean;
};

const ESTIMATE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: `${n} · ${formatAmount(estimateToAmount(n, "MYR"), "MYR")}`,
}));

export default function PptRequestModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [step, setStep] = useState<1 | 3>(1);

  // Teams & projects
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // New issue fields
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Existing issue search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LinearIssue[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);

  // PPT details (step 3)
  const [estimate, setEstimate] = useState<string>("1");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);

  // Load teams when modal opens
  useEffect(() => {
    if (opened && teams.length === 0) {
      setTeamsLoading(true);
      getLinearTeams().then((result) => {
        setTeamsLoading(false);
        if ("teams" in result) {
          setTeams(result.teams);
        } else if (result.error === "reauth_required") {
          signIn.oauth2({
            providerId: "linear",
            callbackURL: "/dashboard/ppts",
          });
        }
      });
    }
  }, [opened, teams.length]);

  // Load projects when team changes
  useEffect(() => {
    if (selectedTeamId) {
      setProjectsLoading(true);
      setSelectedProjectId(null);
      getLinearProjects(selectedTeamId).then((result) => {
        setProjectsLoading(false);
        if ("projects" in result) {
          setProjects(result.projects);
        }
      });
    } else {
      setProjects([]);
    }
  }, [selectedTeamId]);

  // Debounced search
  const debouncedSearch = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const result = await searchLinearIssues(query);
    setSearchLoading(false);
    if ("issues" in result) {
      setSearchResults(result.issues);
    } else if (result.error === "reauth_required") {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: "/dashboard/ppts",
      });
    }
  }, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  function resetForm() {
    setStep(1);
    setMode("existing");
    setSelectedTeamId(null);
    setSelectedProjectId(null);
    setNewTitle("");
    setNewDescription("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIssue(null);
    setEstimate("1");
    setDueDate(null);
    setNote("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function canProceedToStep3() {
    if (mode === "new") {
      return Boolean(selectedTeamId && newTitle.trim());
    }
    return selectedIssue !== null;
  }

  async function handleSubmit() {
    if (!dueDate) {
      toast.error("Please select a projected due date");
      return;
    }

    setSubmitting(true);

    const result = await submitPptRequest({
      mode,
      linearIssueId: selectedIssue?.id,
      linearIssueIdentifier: selectedIssue?.identifier,
      linearIssueTitle:
        mode === "new" ? newTitle.trim() : (selectedIssue?.title ?? ""),
      linearIssueUrl: selectedIssue?.url,
      linearTeamId:
        mode === "new" ? (selectedTeamId ?? "") : (selectedIssue?.teamId ?? ""),
      requestedEstimate: Number.parseInt(estimate, 10),
      projectedDueDate: new Date(dueDate).toISOString(),
      description:
        mode === "new" ? newDescription.trim() || undefined : undefined,
      note: note.trim() || undefined,
    });

    setSubmitting(false);

    if (result.error) {
      if ("reauth" in result && result.reauth) {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard/ppts",
        });
        return;
      }
      toast.error(result.error);
    } else {
      toast.success("PPT request submitted successfully");
      handleClose();
      router.refresh();
    }
  }

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Request PPT"
      centered
      size="lg"
      radius="md"
      overlayProps={{ blur: 4 }}
    >
      <Stack gap="md">
        <Stepper
          active={step === 1 ? 0 : 1}
          size="xs"
          iconSize={28}
          onStepClick={(idx) => {
            if (idx === 0) setStep(1);
            else if (idx === 1 && canProceedToStep3()) setStep(3);
          }}
        >
          <StepperStep
            label="Pick task"
            icon={<Search size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
          <StepperStep
            label="PPT details"
            icon={<SlidersHorizontal size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
        </Stepper>

        <StepTransition step={step}>
          {step === 1 && (
            <Stack gap="md">
              <Text fz="sm" c="dimmed">
                Choose whether to create a new Linear issue or request PPT
                status for an existing one.
              </Text>
              <SegmentedControl
                value={mode}
                onChange={(v) => setMode(v as "new" | "existing")}
                data={[
                  { value: "existing", label: "Existing Issue" },
                  { value: "new", label: "New Issue" },
                ]}
                fullWidth
              />

              {mode === "existing" && (
                <Stack gap="sm">
                  <TextInput
                    label="Search Linear issues"
                    placeholder="Type to search..."
                    leftSection={<Search size={14} />}
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.currentTarget.value)}
                  />
                  {searchLoading && (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  )}
                  {searchResults.length > 0 && (
                    <Stack gap="xs" mah={300} style={{ overflowY: "auto" }}>
                      {searchResults.map((issue) => {
                        const disabled =
                          issue.hasPptLabel || issue.hasExistingRequest;
                        const isSelected = selectedIssue?.id === issue.id;
                        return (
                          <motion.div
                            key={issue.id}
                            whileHover={
                              disabled ? undefined : { y: -1, scale: 1.005 }
                            }
                            transition={SPRING.snappy}
                          >
                            <Card
                              withBorder
                              radius="sm"
                              padding="sm"
                              style={{
                                cursor: disabled ? "not-allowed" : "pointer",
                                opacity: disabled ? 0.5 : 1,
                                borderColor: isSelected
                                  ? "var(--mantine-color-blue-6)"
                                  : undefined,
                                backgroundColor: isSelected
                                  ? "rgba(34, 139, 230, 0.1)"
                                  : undefined,
                                transition:
                                  "border-color 0.18s ease, background-color 0.18s ease",
                              }}
                              onClick={() => {
                                if (!disabled) setSelectedIssue(issue);
                              }}
                            >
                              <Group justify="space-between" wrap="nowrap">
                                <Box style={{ minWidth: 0, flex: 1 }}>
                                  <Group gap="xs">
                                    <Badge
                                      size="xs"
                                      variant="light"
                                      color="gray"
                                    >
                                      {issue.identifier}
                                    </Badge>
                                    <Badge size="xs" variant="light">
                                      {issue.stateName}
                                    </Badge>
                                    {issue.hasPptLabel && (
                                      <Badge size="xs" color="green">
                                        Already PPT
                                      </Badge>
                                    )}
                                    {issue.hasExistingRequest && (
                                      <Badge size="xs" color="yellow">
                                        Request Pending
                                      </Badge>
                                    )}
                                  </Group>
                                  <Text fz="sm" fw={500} mt={4} truncate="end">
                                    {issue.title}
                                  </Text>
                                </Box>
                              </Group>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </Stack>
                  )}
                  {searchQuery &&
                    !searchLoading &&
                    searchResults.length === 0 && (
                      <Text fz="sm" c="dimmed" ta="center" py="md">
                        No issues found
                      </Text>
                    )}
                </Stack>
              )}

              {mode === "new" && (
                <Stack gap="sm">
                  <Select
                    label="Team"
                    placeholder={
                      teamsLoading ? "Loading teams..." : "Select team"
                    }
                    data={teams.map((t) => ({
                      value: t.id,
                      label: `${t.key} — ${t.name}`,
                    }))}
                    value={selectedTeamId}
                    onChange={setSelectedTeamId}
                    disabled={teamsLoading}
                    required
                  />
                  {selectedTeamId && (
                    <Select
                      label="Project (optional)"
                      placeholder={
                        projectsLoading ? "Loading..." : "Select project"
                      }
                      data={projects.map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                      value={selectedProjectId}
                      onChange={setSelectedProjectId}
                      disabled={projectsLoading}
                      clearable
                    />
                  )}
                  <TextInput
                    label="Issue title"
                    placeholder="Describe the task"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.currentTarget.value)}
                    required
                  />
                  <Textarea
                    label="Description (optional)"
                    placeholder="Provide more details about the task"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.currentTarget.value)}
                    autosize
                    minRows={2}
                    maxRows={5}
                  />
                </Stack>
              )}

              <Group justify="flex-end">
                <Button variant="default" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3()}
                  rightSection={<ArrowRight size={14} />}
                >
                  Next
                </Button>
              </Group>
            </Stack>
          )}

          {step === 3 && (
            <Stack gap="md">
              <Card
                withBorder
                radius="sm"
                padding="sm"
                bg="var(--mantine-color-dark-6)"
              >
                {mode === "existing" && selectedIssue && (
                  <Group gap="xs">
                    <Badge size="xs" variant="light" color="gray">
                      {selectedIssue.identifier}
                    </Badge>
                    <Text fz="sm" fw={500} truncate="end">
                      {selectedIssue.title}
                    </Text>
                  </Group>
                )}
                {mode === "new" && (
                  <Group gap="xs">
                    <Badge size="xs" color="blue">
                      New Issue
                    </Badge>
                    <Text fz="sm" fw={500} truncate="end">
                      {newTitle}
                    </Text>
                  </Group>
                )}
              </Card>

              <Box>
                <Text fz="sm" fw={500} mb={4}>
                  Complexity
                </Text>
                <SegmentedControl
                  value={estimate}
                  onChange={setEstimate}
                  data={ESTIMATE_OPTIONS}
                  fullWidth
                />
              </Box>

              <DateInput
                label="Projected due date"
                placeholder="Select date"
                leftSection={<CalendarClock size={14} />}
                value={dueDate}
                onChange={setDueDate}
                minDate={tomorrow}
                required
              />

              <Textarea
                label="Note (optional)"
                placeholder="Why should this be a PPT? Any additional context..."
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={4}
              />

              <Group justify="space-between">
                <Button
                  variant="default"
                  onClick={() => setStep(1)}
                  leftSection={<ArrowLeft size={14} />}
                >
                  Back
                </Button>
                <Group gap="sm">
                  <Button variant="default" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    loading={submitting}
                    disabled={!dueDate}
                    leftSection={<Send size={14} />}
                  >
                    Submit Request
                  </Button>
                </Group>
              </Group>
            </Stack>
          )}
        </StepTransition>
      </Stack>
    </Modal>
  );
}
