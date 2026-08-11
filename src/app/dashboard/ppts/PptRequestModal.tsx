"use client";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  FileInput,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  StepperStep,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
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
  FileImage,
  FileText,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import AiAssistField from "@/components/ai-assist/AiAssistField";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  SPRING,
  StepTransition,
} from "@/components/animations";
import CampaignBadge from "@/components/CampaignBadge";
import { signIn } from "@/lib/auth-client";
import {
  type CampaignBadgeInfo,
  formatMultiplier,
} from "@/lib/payout-campaign";
import {
  acceptForSurface,
  checkAttachmentSelection,
  describeAttachmentLimits,
  formatFileSize,
} from "@/lib/ppt-attachment-policy";
import { projectPptPayout } from "@/lib/ppt-payout-presentation";
import type { PptRequestPrefill } from "@/lib/task-idea";
import {
  draftPptFromLinearIssue,
  getLinearProjects,
  getLinearTeams,
  searchLinearIssues,
  searchLinearUsers,
} from "./actions";

type LinearTeam = { id: string; name: string; key: string };
type LinearProject = { id: string; name: string };
type LinearUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};
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

type AssigneeIntent = "SELF" | "TEAM_MEMBER" | "OPEN";

/**
 * Complexity options priced at what the task would pay today.
 *
 * A campaign is threaded in rather than resolved here so the arithmetic is the
 * server's; the campaign only reaches this modal when it has no label filter,
 * because a request has no Linear issue yet and therefore no labels to test —
 * quoting a multiplier the eventual task might not qualify for would be a
 * promise DevHub cannot keep.
 */
function estimateOptions(campaign: CampaignBadgeInfo | null) {
  return [1, 2, 3, 4, 5].map((n) => {
    const payout = projectPptPayout(n, "MYR", campaign);
    return { value: String(n), label: `${n} · ${payout.finalLabel}` };
  });
}

function FileList({ files }: { files: File[] }) {
  if (files.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No attachments selected.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      {files.map((file) => {
        const Icon = file.type === "application/pdf" ? FileText : FileImage;
        return (
          <Group key={`${file.name}-${file.size}`} gap="xs" wrap="nowrap">
            <Icon size={16} color="var(--mantine-color-blue-4)" />
            <Text size="sm" fw={500} truncate="end" style={{ flex: 1 }}>
              {file.name}
            </Text>
            <Text size="xs" c="dimmed">
              {formatFileSize(file.size)}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

/**
 * The form's starting values, with an optional idea folded in. Used by BOTH
 * the useState initializers and resetForm(), which is the only way those two
 * can be guaranteed to agree.
 */
function initialState(prefill?: PptRequestPrefill | null) {
  return {
    mode: prefill?.mode ?? ("existing" as "new" | "existing"),
    newTitle: prefill?.mode === "new" ? prefill.newTitle : "",
    description: prefill?.description ?? "",
    estimate: prefill?.estimate ?? "1",
  };
}

export default function PptRequestModal({
  opened,
  onClose,
  campaign = null,
  prefill = null,
}: {
  opened: boolean;
  onClose: () => void;
  /** Live PPT campaign with no label restriction; null otherwise. */
  campaign?: CampaignBadgeInfo | null;
  /**
   * A generated idea to start from. Fills the description, title and estimate;
   * the developer edits and submits as normal. Never the due date.
   */
  prefill?: PptRequestPrefill | null;
}) {
  // resetForm() and the useState initializers MUST agree. They used to be two
  // copies of the same literals, which was survivable while the form always
  // started empty — but with a prefill, drifting apart means closing the modal
  // silently discards the idea the developer chose.
  const initial = initialState(prefill);

  const [mode, setMode] = useState<"new" | "existing">(initial.mode);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [newTitle, setNewTitle] = useState(initial.newTitle);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LinearIssue[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);

  const [description, setDescription] = useState(initial.description);
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  /**
   * Fill the description and estimate from the selected Linear issue. Purely
   * additive: it prefills fields the developer then edits, and a null result
   * (adapter unconfigured, refusal, anything) leaves the form untouched.
   */
  async function handleDraft() {
    if (!selectedIssue) return;
    setDrafting(true);
    try {
      const result = await draftPptFromLinearIssue(selectedIssue.id);
      if ("error" in result && result.error) {
        toast.error("Couldn't draft from this issue — write it manually.");
        return;
      }
      if (!("draft" in result) || !result.draft) {
        toast.info("No draft available — write it manually.");
        return;
      }
      const { draft } = result;
      setDescription(
        [
          draft.scope,
          "",
          "## Acceptance criteria",
          ...draft.acceptanceCriteria.map((line) => `- ${line}`),
        ].join("\n"),
      );
      setEstimate(String(draft.estimate));
      toast.success("Drafted — review and edit before submitting.");
    } finally {
      setDrafting(false);
    }
  }

  const [assigneeIntent, setAssigneeIntent] = useState<AssigneeIntent>("SELF");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<LinearUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LinearUser | null>(null);

  const [estimate, setEstimate] = useState(initial.estimate);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
  const issueTitle =
    mode === "new" ? newTitle.trim() : (selectedIssue?.title ?? "");

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

  useEffect(() => {
    if (!selectedTeamId) {
      setProjects([]);
      setSelectedProjectId(null);
      return;
    }
    setProjectsLoading(true);
    setSelectedProjectId(null);
    getLinearProjects(selectedTeamId).then((result) => {
      setProjectsLoading(false);
      if ("projects" in result) {
        setProjects(result.projects);
      }
    });
  }, [selectedTeamId]);

  const debouncedIssueSearch = useDebouncedCallback(async (query: string) => {
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

  const debouncedUserSearch = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setUserResults([]);
      setUsersLoading(false);
      return;
    }
    setUsersLoading(true);
    const result = await searchLinearUsers(query);
    setUsersLoading(false);
    if ("users" in result) {
      setUserResults(result.users);
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
      debouncedIssueSearch(value);
    },
    [debouncedIssueSearch],
  );

  const handleUserSearchChange = useCallback(
    (value: string) => {
      setUserQuery(value);
      debouncedUserSearch(value);
    },
    [debouncedUserSearch],
  );

  function goTo(nextStep: number) {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }

  function resetForm() {
    const next = initialState(prefill);
    setStep(0);
    setDirection(1);
    setMode(next.mode);
    setSelectedTeamId(null);
    setSelectedProjectId(null);
    setNewTitle(next.newTitle);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIssue(null);
    setDescription(next.description);
    setNote("");
    setFiles([]);
    setAssigneeIntent("SELF");
    setUserQuery("");
    setUserResults([]);
    setSelectedUser(null);
    setEstimate(next.estimate);
    // Never prefilled: the server checks only that a due date parses, not that
    // it is in the future, so a human picking it is the last guard against a
    // past-dated request.
    setDueDate(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function canProceedFrom(currentStep: number) {
    if (currentStep === 0) {
      if (mode === "new") return Boolean(selectedTeamId && newTitle.trim());
      return selectedIssue !== null;
    }
    if (currentStep === 2) {
      return assigneeIntent !== "TEAM_MEMBER" || selectedUser !== null;
    }
    if (currentStep === 3) return Boolean(dueDate);
    return true;
  }

  function validateFiles(nextFiles: File[]) {
    const rejection = checkAttachmentSelection(nextFiles, "ppt-request");
    if (rejection) {
      toast.error(rejection.error);
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!dueDate) {
      toast.error("Please select a projected due date");
      return;
    }
    if (!canProceedFrom(2)) {
      toast.error("Choose the intended assignee");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("linearIssueTitle", issueTitle);
    formData.set(
      "linearTeamId",
      mode === "new" ? (selectedTeamId ?? "") : (selectedIssue?.teamId ?? ""),
    );
    formData.set("requestedEstimate", estimate);
    formData.set("projectedDueDate", new Date(dueDate).toISOString());
    formData.set("description", description.trim());
    formData.set("note", note.trim());
    formData.set("assigneeIntent", assigneeIntent);

    if (mode === "new") {
      if (selectedProject) {
        formData.set("linearProjectId", selectedProject.id);
        formData.set("linearProjectName", selectedProject.name);
      }
    } else if (selectedIssue) {
      formData.set("linearIssueId", selectedIssue.id);
      formData.set("linearIssueIdentifier", selectedIssue.identifier);
      formData.set("linearIssueUrl", selectedIssue.url);
    }

    if (assigneeIntent === "TEAM_MEMBER" && selectedUser) {
      formData.set("intendedAssigneeLinearId", selectedUser.id);
      formData.set("intendedAssigneeName", selectedUser.name);
      if (selectedUser.email) {
        formData.set("intendedAssigneeEmail", selectedUser.email);
      }
    }

    for (const file of files) {
      formData.append("attachments", file);
    }

    const response = await fetch("/api/ppt-requests", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      reauth?: boolean;
    };
    setSubmitting(false);

    if (!response.ok || result.error) {
      if (result.reauth || result.error === "reauth_required") {
        signIn.oauth2({
          providerId: "linear",
          callbackURL: "/dashboard/ppts",
        });
        return;
      }
      toast.error(result.error ?? "Failed to submit PPT request");
      return;
    }

    toast.success("PPT request submitted");
    handleClose();
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
      size="xl"
      radius="md"
      transitionProps={MODAL_TRANSITION}
      overlayProps={{ ...OVERLAY_PROPS }}
    >
      <Stack gap="md">
        <Stepper active={step} size="xs" iconSize={28}>
          <StepperStep
            label="Task"
            icon={<Search size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
          <StepperStep
            label="Brief"
            icon={<FileText size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
          <StepperStep
            label="Assignee"
            icon={<Users size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
          <StepperStep
            label="Review"
            icon={<SlidersHorizontal size={14} />}
            completedIcon={<CheckCircle2 size={14} />}
          />
        </Stepper>

        <StepTransition step={step} direction={direction}>
          {step === 0 && (
            <Stack gap="md">
              <SegmentedControl
                value={mode}
                onChange={(value) => {
                  setMode(value as "new" | "existing");
                  setSelectedIssue(null);
                }}
                data={[
                  { value: "existing", label: "Existing issue" },
                  { value: "new", label: "New issue" },
                ]}
                fullWidth
              />

              {mode === "existing" ? (
                <Stack gap="sm">
                  <TextInput
                    label="Search Linear issues"
                    placeholder="Type an issue title or identifier"
                    leftSection={<Search size={14} />}
                    value={searchQuery}
                    onChange={(event) =>
                      handleSearchChange(event.currentTarget.value)
                    }
                  />
                  {searchLoading && (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  )}
                  <Stack gap="xs" mah={300} style={{ overflowY: "auto" }}>
                    {searchResults.map((issue) => {
                      const disabled =
                        issue.hasPptLabel || issue.hasExistingRequest;
                      const selected = selectedIssue?.id === issue.id;
                      return (
                        <motion.div
                          key={issue.id}
                          whileHover={disabled ? undefined : { y: -2 }}
                          transition={SPRING.snappy}
                        >
                          <Card
                            withBorder
                            radius="sm"
                            padding="sm"
                            onClick={() => {
                              if (!disabled) setSelectedIssue(issue);
                            }}
                            style={{
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.5 : 1,
                              borderColor: selected
                                ? "var(--mantine-color-blue-6)"
                                : undefined,
                              backgroundColor: selected
                                ? "rgba(34, 139, 230, 0.1)"
                                : undefined,
                            }}
                          >
                            <Group justify="space-between" wrap="nowrap">
                              <Box style={{ minWidth: 0 }}>
                                <Group gap="xs">
                                  <Badge size="xs" variant="light" color="gray">
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
                                      Request pending
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
                  {searchQuery &&
                    !searchLoading &&
                    searchResults.length === 0 && (
                      <Text fz="sm" c="dimmed" ta="center" py="md">
                        No issues found
                      </Text>
                    )}
                </Stack>
              ) : (
                <Stack gap="sm">
                  <Select
                    label="Team"
                    placeholder={
                      teamsLoading ? "Loading teams..." : "Select team"
                    }
                    data={teams.map((team) => ({
                      value: team.id,
                      label: `${team.key} - ${team.name}`,
                    }))}
                    value={selectedTeamId}
                    onChange={setSelectedTeamId}
                    disabled={teamsLoading}
                    required
                  />
                  {selectedTeamId && (
                    <Select
                      label="Project"
                      placeholder={
                        projectsLoading ? "Loading..." : "Select project"
                      }
                      data={projects.map((project) => ({
                        value: project.id,
                        label: project.name,
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
                    onChange={(event) => setNewTitle(event.currentTarget.value)}
                    required
                  />
                </Stack>
              )}

              <Group justify="flex-end">
                <Button variant="default" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => goTo(1)}
                  disabled={!canProceedFrom(0)}
                  rightSection={<ArrowRight size={14} />}
                >
                  Next
                </Button>
              </Group>
            </Stack>
          )}

          {step === 1 && (
            <Stack gap="md">
              <Card withBorder radius="sm" padding="sm">
                <Group gap="xs">
                  <Badge size="xs" color={mode === "new" ? "blue" : "gray"}>
                    {mode === "new" ? "New issue" : selectedIssue?.identifier}
                  </Badge>
                  <Text size="sm" fw={600} truncate="end">
                    {issueTitle}
                  </Text>
                </Group>
              </Card>

              <Tabs defaultValue="write">
                <TabsList>
                  <TabsTab value="write">Write</TabsTab>
                  <TabsTab value="preview">Preview</TabsTab>
                  {/* Drafting is optional everywhere: without the LLM adapter
                      configured this simply never appears and the form is
                      unchanged. */}
                  {mode === "existing" && selectedIssue && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      ml="auto"
                      leftSection={<Sparkles size={13} />}
                      loading={drafting}
                      onClick={handleDraft}
                    >
                      Draft from issue
                    </Button>
                  )}
                </TabsList>
                <TabsPanel value="write" pt="sm">
                  <Textarea
                    ref={descriptionRef}
                    label="Description"
                    placeholder="Acceptance criteria, references, constraints, and anything admins need to judge the PPT request."
                    value={description}
                    onChange={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                    autosize
                    minRows={7}
                    maxRows={12}
                  />
                  {/* Sits under the description rather than in the tab strip:
                      "Draft from issue" fills an empty form from Linear, this
                      works on what has already been written. */}
                  <AiAssistField
                    fieldId="ppt_request_description"
                    value={description}
                    onChange={setDescription}
                    textareaRef={descriptionRef}
                    disabled={submitting}
                  />
                </TabsPanel>
                <TabsPanel value="preview" pt="sm">
                  <Card withBorder radius="sm" padding="md" mih={180}>
                    {description.trim() ? (
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {description}
                      </Markdown>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Nothing to preview yet.
                      </Text>
                    )}
                  </Card>
                </TabsPanel>
              </Tabs>

              <div>
                <Textarea
                  ref={noteRef}
                  label="Admin note"
                  placeholder="Why should this be a PPT? Anything sensitive or decision-specific goes here."
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={4}
                />
                <AiAssistField
                  fieldId="ppt_request_note"
                  value={note}
                  onChange={setNote}
                  textareaRef={noteRef}
                  disabled={submitting}
                />
              </div>

              <FileInput
                label="Attachments"
                placeholder="Upload images or PDFs"
                accept={acceptForSurface("ppt-request")}
                multiple
                value={files}
                onChange={(nextFiles) => {
                  const value = nextFiles ?? [];
                  if (validateFiles(value)) setFiles(value);
                }}
                leftSection={<FileImage size={14} />}
                description={describeAttachmentLimits("ppt-request")}
              />
              <FileList files={files} />

              <Group justify="space-between">
                <Button
                  variant="default"
                  onClick={() => goTo(0)}
                  leftSection={<ArrowLeft size={14} />}
                >
                  Back
                </Button>
                <Button
                  onClick={() => goTo(2)}
                  rightSection={<ArrowRight size={14} />}
                >
                  Next
                </Button>
              </Group>
            </Stack>
          )}

          {step === 2 && (
            <Stack gap="md">
              <SegmentedControl
                value={assigneeIntent}
                onChange={(value) => {
                  setAssigneeIntent(value as AssigneeIntent);
                  setSelectedUser(null);
                }}
                data={[
                  { value: "SELF", label: "Assign to me" },
                  { value: "TEAM_MEMBER", label: "Assign teammate" },
                  { value: "OPEN", label: "Leave open" },
                ]}
                fullWidth
              />

              {assigneeIntent === "SELF" && (
                <Card withBorder radius="sm" padding="md">
                  <Group gap="sm">
                    <UserCheck size={18} color="var(--mantine-color-green-4)" />
                    <Box>
                      <Text size="sm" fw={700}>
                        You intend to take this task.
                      </Text>
                      <Text size="xs" c="dimmed">
                        Admins can still change the final assignment during
                        review.
                      </Text>
                    </Box>
                  </Group>
                </Card>
              )}

              {assigneeIntent === "OPEN" && (
                <Card withBorder radius="sm" padding="md">
                  <Group gap="sm">
                    <Users size={18} color="var(--mantine-color-blue-4)" />
                    <Box>
                      <Text size="sm" fw={700}>
                        This should be open for anyone to claim.
                      </Text>
                      <Text size="xs" c="dimmed">
                        If approved, opted-in developers can receive an
                        unclaimed PPT notification.
                      </Text>
                    </Box>
                  </Group>
                </Card>
              )}

              {assigneeIntent === "TEAM_MEMBER" && (
                <Stack gap="sm">
                  <TextInput
                    label="Search Linear teammates"
                    placeholder="Name or email"
                    value={userQuery}
                    onChange={(event) =>
                      handleUserSearchChange(event.currentTarget.value)
                    }
                    leftSection={<Search size={14} />}
                  />
                  {usersLoading && (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  )}
                  <Stack gap="xs" mah={280} style={{ overflowY: "auto" }}>
                    {userResults.map((user) => {
                      const selected = selectedUser?.id === user.id;
                      return (
                        <Card
                          key={user.id}
                          withBorder
                          radius="sm"
                          padding="sm"
                          onClick={() => setSelectedUser(user)}
                          style={{
                            cursor: "pointer",
                            borderColor: selected
                              ? "var(--mantine-color-blue-6)"
                              : undefined,
                            backgroundColor: selected
                              ? "rgba(34, 139, 230, 0.1)"
                              : undefined,
                          }}
                        >
                          <Group gap="sm" wrap="nowrap">
                            <Avatar src={user.avatarUrl} size={28} radius="xl">
                              {user.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box style={{ minWidth: 0 }}>
                              <Text size="sm" fw={700} truncate="end">
                                {user.name}
                              </Text>
                              {user.email && (
                                <Text size="xs" c="dimmed" truncate="end">
                                  {user.email}
                                </Text>
                              )}
                            </Box>
                          </Group>
                        </Card>
                      );
                    })}
                  </Stack>
                </Stack>
              )}

              <Group justify="space-between">
                <Button
                  variant="default"
                  onClick={() => goTo(1)}
                  leftSection={<ArrowLeft size={14} />}
                >
                  Back
                </Button>
                <Button
                  onClick={() => goTo(3)}
                  disabled={!canProceedFrom(2)}
                  rightSection={<ArrowRight size={14} />}
                >
                  Next
                </Button>
              </Group>
            </Stack>
          )}

          {step === 3 && (
            <Stack gap="md">
              <Card withBorder radius="sm" padding="md">
                <Stack gap="sm">
                  <Group gap="xs">
                    <Badge color={mode === "new" ? "blue" : "gray"}>
                      {mode === "new" ? "New issue" : selectedIssue?.identifier}
                    </Badge>
                    {selectedProject && (
                      <Badge variant="dot" color="gray">
                        {selectedProject.name}
                      </Badge>
                    )}
                    <Badge variant="light">
                      {assigneeIntent === "SELF"
                        ? "Assign to me"
                        : assigneeIntent === "TEAM_MEMBER"
                          ? `Assign ${selectedUser?.name}`
                          : "Open to claim"}
                    </Badge>
                  </Group>
                  <Text fw={700}>{issueTitle}</Text>
                  <FileList files={files} />
                </Stack>
              </Card>

              <Box>
                <Group justify="space-between" mb={4}>
                  <Text fz="sm" fw={500}>
                    Complexity
                  </Text>
                  {campaign && <CampaignBadge campaign={campaign} />}
                </Group>
                <SegmentedControl
                  value={estimate}
                  onChange={setEstimate}
                  data={estimateOptions(campaign)}
                  fullWidth
                />
                {campaign && (
                  <Text fz="xs" c={campaign.accentColor} mt={6}>
                    {campaign.name} is paying{" "}
                    {formatMultiplier(campaign.multiplier)} until{" "}
                    {new Date(campaign.endsAt).toLocaleString()}. These amounts
                    hold if the task is approved and becomes payable before
                    then; after that it pays the normal rate.
                  </Text>
                )}
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

              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {files.length} attachment{files.length === 1 ? "" : "s"} ·{" "}
                  {formatFileSize(totalFileSize)}
                </Text>
                <Group gap={6} wrap="nowrap">
                  {campaign && <CampaignBadge campaign={campaign} />}
                  <Text
                    size="sm"
                    fw={700}
                    c={campaign ? campaign.accentColor : "green"}
                  >
                    {
                      projectPptPayout(Number(estimate), "MYR", campaign)
                        .finalLabel
                    }
                  </Text>
                </Group>
              </Group>

              <Group justify="space-between">
                <Button
                  variant="default"
                  onClick={() => goTo(2)}
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
                    disabled={!canProceedFrom(3)}
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
