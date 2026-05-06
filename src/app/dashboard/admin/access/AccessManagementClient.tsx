"use client";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DEVELOPER_RANK_LABELS,
  DEVELOPER_RANKS,
  DEVELOPER_SPECIALTIES,
  DEVELOPER_SPECIALTY_LABELS,
  type DeveloperRankValue,
  type DeveloperSpecialtyValue,
  PROJECT_ACCESS_LEVEL_LABELS,
  PROJECT_ACCESS_LEVELS,
  type ProjectAccessLevelValue,
} from "@/lib/developer-access";
import {
  saveIntegrationConfig,
  saveProject,
  saveRankRoleMapping,
  saveSpecialtyRoleMapping,
  saveUserAccess,
  syncAccessForUser,
} from "./actions";

type ConfigDraft = {
  robloxDevelopmentGroupId: string | null;
  robloxPublisherGroupId: string | null;
  robloxDevelopmentLegacyFallbackRoleId: string;
  robloxPublisherLegacyFallbackRoleId: string;
  robloxOpenCloudEnabled: boolean;
  robloxLegacyEnabled: boolean;
  discordGuildId: string | null;
  discordEnabled: boolean;
  linearEnabled: boolean;
};

type RankMappingDraft = {
  rank: DeveloperRankValue;
  robloxRoleId: string;
  robloxLegacyRoleId: string;
  discordRoleId: string;
};

type SpecialtyMappingDraft = {
  specialty: DeveloperSpecialtyValue;
  discordRoleId: string;
};

type ProjectDraft = {
  id: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  isActive: boolean;
  robloxContributorRoleId: string | null;
  robloxDeveloperRoleId: string | null;
  robloxPublisherRoleId: string | null;
  robloxContributorLegacyRoleId: string;
  robloxDeveloperLegacyRoleId: string;
  robloxPublisherLegacyRoleId: string;
  discordContributorRoleId: string | null;
  discordDeveloperRoleId: string | null;
  discordPublisherRoleId: string | null;
  linearTeamId: string | null;
  linearProjectId: string | null;
};

type UserDraft = {
  id: string;
  displayName: string;
  email: string;
  image: string | null;
  developerRank: DeveloperRankValue;
  specialties: DeveloperSpecialtyValue[];
  robloxId: string | null;
  discordId: string | null;
  linearId: string | null;
  memberships: {
    projectId: string;
    accessLevel: ProjectAccessLevelValue;
    allowJuniorRobloxAccess: boolean;
  }[];
  lastSyncLogs: {
    id: string;
    platform: string;
    status: string;
    action: string;
    error: string | null;
    dryRun: boolean;
    createdAt: string;
  }[];
};

type Props = {
  config: ConfigDraft | null;
  rankMappings: RankMappingDraft[];
  specialtyMappings: SpecialtyMappingDraft[];
  projects: ProjectDraft[];
  users: UserDraft[];
};

type PlatformSyncResult = {
  platform: string;
  status: string;
  error?: string | null;
};

const rankOptions = DEVELOPER_RANKS.map((rank) => ({
  value: rank,
  label: DEVELOPER_RANK_LABELS[rank],
}));

const specialtyOptions = DEVELOPER_SPECIALTIES.map((specialty) => ({
  value: specialty,
  label: DEVELOPER_SPECIALTY_LABELS[specialty],
}));

const accessOptions = PROJECT_ACCESS_LEVELS.map((level) => ({
  value: level,
  label: PROJECT_ACCESS_LEVEL_LABELS[level],
}));

function failedSyncs(results: PlatformSyncResult[] | undefined) {
  return results?.filter((item) => item.status === "FAILED") ?? [];
}

function failedSyncMessage(failed: PlatformSyncResult[]) {
  if (failed.length === 1) {
    const [failure] = failed;
    return `${failure.platform} sync failed${
      failure.error ? `: ${failure.error}` : ""
    }`;
  }

  return `${failed.length} platform syncs failed`;
}

function emptyProject(): ProjectDraft {
  return {
    id: null,
    name: "",
    slug: null,
    description: null,
    isActive: true,
    robloxContributorRoleId: null,
    robloxDeveloperRoleId: null,
    robloxPublisherRoleId: null,
    robloxContributorLegacyRoleId: "",
    robloxDeveloperLegacyRoleId: "",
    robloxPublisherLegacyRoleId: "",
    discordContributorRoleId: null,
    discordDeveloperRoleId: null,
    discordPublisherRoleId: null,
    linearTeamId: null,
    linearProjectId: null,
  };
}

function normalizeProject(project: ProjectDraft) {
  return {
    ...project,
    robloxContributorRoleId: project.robloxContributorRoleId || null,
    robloxDeveloperRoleId: project.robloxDeveloperRoleId || null,
    robloxPublisherRoleId: project.robloxPublisherRoleId || null,
    discordContributorRoleId: project.discordContributorRoleId || null,
    discordDeveloperRoleId: project.discordDeveloperRoleId || null,
    discordPublisherRoleId: project.discordPublisherRoleId || null,
    linearTeamId: project.linearTeamId || null,
    linearProjectId: project.linearProjectId || null,
  };
}

function orderProjects(projects: ProjectDraft[]) {
  return [...projects].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function RoleMappings({
  initialRankMappings,
  initialSpecialtyMappings,
}: {
  initialRankMappings: RankMappingDraft[];
  initialSpecialtyMappings: SpecialtyMappingDraft[];
}) {
  const [rankMappings, setRankMappings] = useState(initialRankMappings);
  const [specialtyMappings, setSpecialtyMappings] = useState(
    initialSpecialtyMappings,
  );
  const [loading, setLoading] = useState<string | null>(null);

  async function saveRank(mapping: RankMappingDraft) {
    setLoading(mapping.rank);
    const result = await saveRankRoleMapping(mapping);
    if (result.error) toast.error(result.error);
    else toast.success(`${DEVELOPER_RANK_LABELS[mapping.rank]} mapping saved`);
    setLoading(null);
  }

  async function saveSpecialty(mapping: SpecialtyMappingDraft) {
    setLoading(mapping.specialty);
    const result = await saveSpecialtyRoleMapping(mapping);
    if (result.error) toast.error(result.error);
    else
      toast.success(`${DEVELOPER_SPECIALTY_LABELS[mapping.specialty]} saved`);
    setLoading(null);
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Title order={3} mb="md">
        Role Mappings
      </Title>
      <Stack gap="lg">
        <TableScrollContainer minWidth={840}>
          <Table layout="fixed">
            <TableThead>
              <TableTr>
                <TableTh>Rank</TableTh>
                <TableTh>Development role ID</TableTh>
                <TableTh>Development legacy role ID</TableTh>
                <TableTh>Discord role ID</TableTh>
                <TableTh style={{ width: 110 }} />
              </TableTr>
            </TableThead>
            <TableTbody>
              {rankMappings.map((mapping, index) => (
                <TableTr key={mapping.rank}>
                  <TableTd>
                    <Text size="sm" fw={600}>
                      {DEVELOPER_RANK_LABELS[mapping.rank]}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <TextInput
                      size="xs"
                      value={mapping.robloxRoleId}
                      onChange={(event) =>
                        setRankMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  robloxRoleId: event.currentTarget.value,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </TableTd>
                  <TableTd>
                    <TextInput
                      size="xs"
                      value={mapping.robloxLegacyRoleId}
                      onChange={(event) =>
                        setRankMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  robloxLegacyRoleId: event.currentTarget.value,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </TableTd>
                  <TableTd>
                    <TextInput
                      size="xs"
                      value={mapping.discordRoleId}
                      onChange={(event) =>
                        setRankMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  discordRoleId: event.currentTarget.value,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </TableTd>
                  <TableTd>
                    <Button
                      size="xs"
                      leftSection={<Save size={14} />}
                      loading={loading === mapping.rank}
                      onClick={() => saveRank(mapping)}
                    >
                      Save
                    </Button>
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </TableScrollContainer>

        <TableScrollContainer minWidth={560}>
          <Table layout="fixed">
            <TableThead>
              <TableTr>
                <TableTh>Specialty</TableTh>
                <TableTh>Discord role ID</TableTh>
                <TableTh style={{ width: 110 }} />
              </TableTr>
            </TableThead>
            <TableTbody>
              {specialtyMappings.map((mapping, index) => (
                <TableTr key={mapping.specialty}>
                  <TableTd>
                    {DEVELOPER_SPECIALTY_LABELS[mapping.specialty]}
                  </TableTd>
                  <TableTd>
                    <TextInput
                      size="xs"
                      value={mapping.discordRoleId}
                      onChange={(event) =>
                        setSpecialtyMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  discordRoleId: event.currentTarget.value,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </TableTd>
                  <TableTd>
                    <Button
                      size="xs"
                      leftSection={<Save size={14} />}
                      loading={loading === mapping.specialty}
                      onClick={() => saveSpecialty(mapping)}
                    >
                      Save
                    </Button>
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Stack>
    </Card>
  );
}

function IntegrationConfig({ initialConfig }: { initialConfig: ConfigDraft }) {
  const [config, setConfig] = useState(initialConfig);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const result = await saveIntegrationConfig(config);
    if (result.error) toast.error(result.error);
    else toast.success("Integration config saved");
    setLoading(false);
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" mb="md">
        <Title order={3}>Platform Config</Title>
        <Button
          size="xs"
          leftSection={<Save size={14} />}
          loading={loading}
          onClick={handleSave}
        >
          Save
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <TextInput
          label="Roblox development group ID"
          value={config.robloxDevelopmentGroupId ?? ""}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxDevelopmentGroupId: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Roblox publisher group ID"
          value={config.robloxPublisherGroupId ?? ""}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxPublisherGroupId: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Development legacy fallback role ID"
          value={config.robloxDevelopmentLegacyFallbackRoleId}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxDevelopmentLegacyFallbackRoleId: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Publisher legacy fallback role ID"
          value={config.robloxPublisherLegacyFallbackRoleId}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxPublisherLegacyFallbackRoleId: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Discord guild ID"
          value={config.discordGuildId ?? ""}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              discordGuildId: event.currentTarget.value,
            }))
          }
        />
        <Switch
          label="Enable Roblox Open Cloud sync"
          checked={config.robloxOpenCloudEnabled}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxOpenCloudEnabled: event.currentTarget.checked,
            }))
          }
        />
        <Switch
          label="Enable Roblox legacy sync"
          checked={config.robloxLegacyEnabled}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              robloxLegacyEnabled: event.currentTarget.checked,
            }))
          }
        />
        <Switch
          label="Enable Discord sync"
          checked={config.discordEnabled}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              discordEnabled: event.currentTarget.checked,
            }))
          }
        />
        <Switch
          label="Enable Linear sync"
          checked={config.linearEnabled}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              linearEnabled: event.currentTarget.checked,
            }))
          }
        />
      </SimpleGrid>
    </Card>
  );
}

function ProjectEditor({
  projects,
  onProjectsChange,
}: {
  projects: ProjectDraft[];
  onProjectsChange: (projects: ProjectDraft[]) => void;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(emptyProject());
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSave(project: ProjectDraft, index?: number) {
    setLoading(project.id ?? "new");
    const result = await saveProject(normalizeProject(project));
    if (result.error) {
      toast.error(result.error);
    } else {
      const savedProject = result.project;
      if (!savedProject) {
        toast.error("Project saved, but the project response was missing");
        setLoading(null);
        return;
      }

      toast.success(project.id ? "Project saved" : "Project created");
      if (index === undefined) {
        onProjectsChange(orderProjects([...projects, savedProject]));
        setDraft(emptyProject());
      } else {
        onProjectsChange(
          orderProjects(
            projects.map((item, itemIndex) =>
              itemIndex === index ? savedProject : item,
            ),
          ),
        );
      }
    }
    setLoading(null);
  }

  function projectFields(
    project: ProjectDraft,
    onChange: (next: ProjectDraft) => void,
  ) {
    return (
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <TextInput
            label="Name"
            value={project.name}
            onChange={(event) =>
              onChange({ ...project, name: event.currentTarget.value })
            }
          />
          <TextInput
            label="Slug"
            value={project.slug ?? ""}
            onChange={(event) =>
              onChange({ ...project, slug: event.currentTarget.value })
            }
          />
          <Switch
            label="Active"
            checked={project.isActive}
            mt="xl"
            onChange={(event) =>
              onChange({ ...project, isActive: event.currentTarget.checked })
            }
          />
        </SimpleGrid>
        <Textarea
          label="Description"
          value={project.description ?? ""}
          onChange={(event) =>
            onChange({ ...project, description: event.currentTarget.value })
          }
        />
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <TextInput
            label="Publisher group contributor role"
            value={project.robloxContributorRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                robloxContributorRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Publisher group developer role"
            value={project.robloxDeveloperRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                robloxDeveloperRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Publisher group publisher role"
            value={project.robloxPublisherRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                robloxPublisherRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Publisher legacy contributor role"
            value={project.robloxContributorLegacyRoleId}
            onChange={(event) =>
              onChange({
                ...project,
                robloxContributorLegacyRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Publisher legacy developer role"
            value={project.robloxDeveloperLegacyRoleId}
            onChange={(event) =>
              onChange({
                ...project,
                robloxDeveloperLegacyRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Publisher legacy publisher role"
            value={project.robloxPublisherLegacyRoleId}
            onChange={(event) =>
              onChange({
                ...project,
                robloxPublisherLegacyRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Discord contributor role"
            value={project.discordContributorRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                discordContributorRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Discord developer role"
            value={project.discordDeveloperRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                discordDeveloperRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Discord publisher role"
            value={project.discordPublisherRoleId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                discordPublisherRoleId: event.currentTarget.value,
              })
            }
          />
          <TextInput
            label="Linear team ID"
            value={project.linearTeamId ?? ""}
            onChange={(event) =>
              onChange({ ...project, linearTeamId: event.currentTarget.value })
            }
          />
          <TextInput
            label="Linear project ID"
            value={project.linearProjectId ?? ""}
            onChange={(event) =>
              onChange({
                ...project,
                linearProjectId: event.currentTarget.value,
              })
            }
          />
        </SimpleGrid>
      </Stack>
    );
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Title order={3} mb="md">
        Projects
      </Title>
      <Stack gap="md">
        <Card withBorder radius="sm" padding="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>New project</Text>
            <Button
              size="xs"
              loading={loading === "new"}
              leftSection={<Save size={14} />}
              onClick={() => handleSave(draft)}
            >
              Create
            </Button>
          </Group>
          {projectFields(draft, setDraft)}
        </Card>

        {projects.map((project, index) => (
          <Card key={project.id} withBorder radius="sm" padding="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>{project.name}</Text>
                <Badge color={project.isActive ? "green" : "gray"}>
                  {project.isActive ? "Active" : "Inactive"}
                </Badge>
              </Group>
              <Button
                size="xs"
                loading={loading === project.id}
                leftSection={<Save size={14} />}
                onClick={() => handleSave(project, index)}
              >
                Save
              </Button>
            </Group>
            {projectFields(project, (next) =>
              onProjectsChange(
                projects.map((item, itemIndex) =>
                  itemIndex === index ? next : item,
                ),
              ),
            )}
          </Card>
        ))}
      </Stack>
    </Card>
  );
}

function UserAccess({
  users,
  projects,
}: {
  users: UserDraft[];
  projects: ProjectDraft[];
}) {
  const [drafts, setDrafts] = useState(users);
  const [loading, setLoading] = useState<string | null>(null);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.isActive),
    [projects],
  );

  function updateUser(userId: string, next: Partial<UserDraft>) {
    setDrafts((current) =>
      current.map((user) => (user.id === userId ? { ...user, ...next } : user)),
    );
  }

  function setProjectAccess(
    user: UserDraft,
    projectId: string,
    accessLevel: ProjectAccessLevelValue | null,
  ) {
    const remaining = user.memberships.filter(
      (membership) => membership.projectId !== projectId,
    );
    updateUser(user.id, {
      memberships: accessLevel
        ? [
            ...remaining,
            {
              projectId,
              accessLevel,
              allowJuniorRobloxAccess: false,
            },
          ]
        : remaining,
    });
  }

  function setJuniorOverride(
    user: UserDraft,
    projectId: string,
    allowJuniorRobloxAccess: boolean,
  ) {
    updateUser(user.id, {
      memberships: user.memberships.map((membership) =>
        membership.projectId === projectId
          ? { ...membership, allowJuniorRobloxAccess }
          : membership,
      ),
    });
  }

  async function handleSave(user: UserDraft) {
    setLoading(`${user.id}:save`);
    const result = await saveUserAccess({
      userId: user.id,
      developerRank: user.developerRank,
      specialties: user.specialties,
      projects: user.memberships,
    });
    if (result.error) toast.error(result.error);
    else {
      const failed = "results" in result ? failedSyncs(result.results) : [];
      if (failed.length) {
        toast.error(
          `${user.displayName} access saved, but ${failedSyncMessage(failed)}`,
        );
      } else if (result.syncError) toast.warning(result.syncError);
      else toast.success(`${user.displayName} access saved and synced`);
    }
    setLoading(null);
  }

  async function handleSync(user: UserDraft, dryRun: boolean) {
    setLoading(`${user.id}:${dryRun ? "dry" : "sync"}`);
    const result = await syncAccessForUser(user.id, dryRun);
    if (result.error) {
      toast.error(result.error);
    } else {
      const failed = failedSyncs(result.results);
      if (failed?.length) {
        toast.error(failedSyncMessage(failed));
      } else {
        toast.success(dryRun ? "Dry run completed" : "Access synced");
      }
    }
    setLoading(null);
  }

  return (
    <Card withBorder radius="md" padding="lg">
      <Title order={3} mb="md">
        Team Access
      </Title>
      <Stack gap="md">
        {drafts.map((user) => (
          <Card key={user.id} withBorder radius="sm" padding="md">
            <Group justify="space-between" align="flex-start" mb="md">
              <Group>
                <Avatar src={user.image} radius="xl" />
                <div>
                  <Text fw={600}>{user.displayName}</Text>
                  <Text size="xs" c="dimmed">
                    {user.email}
                  </Text>
                  <Group gap={4} mt={4}>
                    {user.linearId && <Badge size="xs">Linear</Badge>}
                    {user.discordId && (
                      <Badge size="xs" color="indigo">
                        Discord
                      </Badge>
                    )}
                    {user.robloxId && (
                      <Badge size="xs" color="green">
                        Roblox
                      </Badge>
                    )}
                  </Group>
                </div>
              </Group>
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<RotateCcw size={14} />}
                  loading={loading === `${user.id}:dry`}
                  onClick={() => handleSync(user, true)}
                >
                  Dry run
                </Button>
                <Button
                  size="xs"
                  leftSection={<RotateCcw size={14} />}
                  loading={loading === `${user.id}:sync`}
                  onClick={() => handleSync(user, false)}
                >
                  Sync
                </Button>
                <Button
                  size="xs"
                  leftSection={<Save size={14} />}
                  loading={loading === `${user.id}:save`}
                  onClick={() => handleSave(user)}
                >
                  Save
                </Button>
              </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Select
                label="Developer rank"
                data={rankOptions}
                value={user.developerRank}
                onChange={(value) =>
                  value &&
                  updateUser(user.id, {
                    developerRank: value as DeveloperRankValue,
                  })
                }
              />
              <MultiSelect
                label="Specialties"
                data={specialtyOptions}
                value={user.specialties}
                onChange={(value) =>
                  updateUser(user.id, {
                    specialties: value as DeveloperSpecialtyValue[],
                  })
                }
              />
            </SimpleGrid>

            {activeProjects.length > 0 && (
              <TableScrollContainer minWidth={760}>
                <Table mt="md" layout="fixed">
                  <TableThead>
                    <TableTr>
                      <TableTh>Project</TableTh>
                      <TableTh>Access</TableTh>
                      <TableTh>Junior Roblox override</TableTh>
                    </TableTr>
                  </TableThead>
                  <TableTbody>
                    {activeProjects.map((project) => {
                      const membership = user.memberships.find(
                        (item) => item.projectId === project.id,
                      );
                      return (
                        <TableTr key={project.id}>
                          <TableTd>{project.name}</TableTd>
                          <TableTd>
                            <Select
                              size="xs"
                              clearable
                              data={accessOptions}
                              value={membership?.accessLevel ?? null}
                              onChange={(value) =>
                                setProjectAccess(
                                  user,
                                  project.id as string,
                                  value as ProjectAccessLevelValue | null,
                                )
                              }
                            />
                          </TableTd>
                          <TableTd>
                            <Checkbox
                              size="xs"
                              disabled={!membership}
                              checked={
                                membership?.allowJuniorRobloxAccess ?? false
                              }
                              onChange={(event) =>
                                setJuniorOverride(
                                  user,
                                  project.id as string,
                                  event.currentTarget.checked,
                                )
                              }
                            />
                          </TableTd>
                        </TableTr>
                      );
                    })}
                  </TableTbody>
                </Table>
              </TableScrollContainer>
            )}

            {user.lastSyncLogs.length > 0 && (
              <Group gap={6} mt="md">
                {user.lastSyncLogs.slice(0, 4).map((log) => (
                  <Badge
                    key={log.id}
                    size="xs"
                    color={
                      log.status === "SUCCESS"
                        ? "green"
                        : log.status === "FAILED"
                          ? "red"
                          : "gray"
                    }
                    variant="light"
                  >
                    {log.platform}
                    {log.dryRun ? " dry" : ""}
                  </Badge>
                ))}
              </Group>
            )}
          </Card>
        ))}
      </Stack>
    </Card>
  );
}

export default function AccessManagementClient({
  config,
  rankMappings,
  specialtyMappings,
  projects: initialProjects,
  users,
}: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const configDraft = config ?? {
    robloxDevelopmentGroupId: null,
    robloxPublisherGroupId: null,
    robloxDevelopmentLegacyFallbackRoleId: "",
    robloxPublisherLegacyFallbackRoleId: "",
    robloxOpenCloudEnabled: true,
    robloxLegacyEnabled: false,
    discordGuildId: null,
    discordEnabled: true,
    linearEnabled: true,
  };

  return (
    <Stack gap="lg">
      <IntegrationConfig initialConfig={configDraft} />
      <RoleMappings
        initialRankMappings={rankMappings}
        initialSpecialtyMappings={specialtyMappings}
      />
      <ProjectEditor projects={projects} onProjectsChange={setProjects} />
      <UserAccess users={users} projects={projects} />
    </Stack>
  );
}
