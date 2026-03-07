import { auth } from "@clerk/nextjs/server";
import type { Issue } from "@linear/sdk";
import {
  Alert,
  Badge,
  Card,
  Group,
  ProgressRoot,
  ProgressSection,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Ticker } from "motion-plus/react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import TaskCard from "@/components/TaskCard";
import { getLinearClient } from "@/lib/linear";

type EnrichedIssue = {
  issue: Issue;
  projectId: string | null;
  projectName: string | null;
  teamName: string | null;
  teamKey: string;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  isAssignedToViewer: boolean;
  subIssueCount: number;
};

type ProjectInfo = {
  name: string;
  startDate: string | null;
  targetDate: string | null;
  progress: number;
  health: string | null;
};

function PPTSkeleton() {
  return (
    <Stack gap="xl">
      {[...Array(2)].map((_, g) => (
        <div key={g}>
          <Skeleton height={24} width={160} mb="md" />
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {[...Array(3)].map((_, i) => (
              <Card key={i} withBorder radius="md" padding="lg">
                <Skeleton height={160} mb="md" />
                <Group justify="space-between" mb="xs">
                  <Skeleton height={20} width={60} />
                  <Skeleton height={20} width={40} />
                </Group>
                <Skeleton height={24} mb="xs" />
                <Skeleton height={14} mb={4} />
                <Skeleton height={14} mb={4} />
                <Skeleton height={14} mb="md" width="70%" />
                <Group
                  justify="space-between"
                  mt="auto"
                  pt="md"
                  style={{
                    borderTop: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Skeleton height={12} width={80} />
                  <Skeleton height={12} width={60} />
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </div>
      ))}
    </Stack>
  );
}

function daysLeft(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProjectSectionHeader({
  info,
  taskCount,
  totalPayout,
}: { info: ProjectInfo; taskCount: number; totalPayout: number }) {
  const days = daysLeft(info.targetDate);
  const progressPct = Math.round(info.progress * 100);

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm" mb="md">
      <Group gap="sm" align="center">
        <Title order={3}>{info.name}</Title>
        {info.health && (
          <Badge
            variant="light"
            size="sm"
            color={
              info.health === "onTrack"
                ? "green"
                : info.health === "atRisk"
                  ? "yellow"
                  : "red"
            }
          >
            {info.health === "onTrack"
              ? "On Track"
              : info.health === "atRisk"
                ? "At Risk"
                : "Off Track"}
          </Badge>
        )}
        <Badge variant="light" color="gray" size="sm">
          {taskCount} task{taskCount !== 1 && "s"}
        </Badge>
        {totalPayout > 0 && (
          <Text fz="sm" c="green" fw={600}>
            RM{totalPayout}
          </Text>
        )}
      </Group>
      <Group gap="sm" align="center">
        <div style={{ width: 120 }}>
          <ProgressRoot size="sm" radius="xl">
            <ProgressSection value={progressPct} color="blue" />
          </ProgressRoot>
        </div>
        <Text fz="xs" c="dimmed" fw={500}>
          {progressPct}%
        </Text>
        {info.startDate && info.targetDate && (
          <Text fz="xs" c="dimmed">
            {formatDate(info.startDate)} &rarr; {formatDate(info.targetDate)}
          </Text>
        )}
        {!info.startDate && info.targetDate && (
          <Text fz="xs" c="dimmed">
            Due {formatDate(info.targetDate)}
          </Text>
        )}
        {days !== null && (
          <Badge
            variant="light"
            size="sm"
            color={days < 0 ? "red" : days <= 7 ? "yellow" : "gray"}
          >
            {days < 0
              ? `${Math.abs(days)}d overdue`
              : days === 0
                ? "Due today"
                : `${days}d left`}
          </Badge>
        )}
      </Group>
    </Group>
  );
}

function IssueGrid({
  items,
  hideProject,
}: { items: EnrichedIssue[]; hideProject?: boolean }) {
  return (
    <StaggerContainer>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {items.map((item) => (
          <StaggerItem key={item.issue.id} className="h-full">
            <TaskCard
              issueId={item.issue.id}
              identifier={item.issue.identifier}
              title={item.issue.title}
              url={item.issue.url}
              estimate={item.issue.estimate}
              description={item.issue.description}
              projectName={item.projectName}
              assigneeName={item.assigneeName}
              assigneeAvatarUrl={item.assigneeAvatarUrl}
              isAssignedToViewer={item.isAssignedToViewer}
              hideProject={hideProject}
              subIssueCount={item.subIssueCount}
              variant="full"
              />
            </StaggerItem>
          ))}
        </SimpleGrid>
      </StaggerContainer>
  );
}

function TeamSection({
  teamName,
  items,
}: {
  teamName: string;
  items: EnrichedIssue[];
}) {
  return (
    <section>
      <Group gap="sm" mb="md" align="baseline">
        <Title order={3}>{teamName}</Title>
        <Badge variant="light" color="gray" size="lg">
          {items.length} task{items.length !== 1 && "s"}
        </Badge>
      </Group>
      <IssueGrid items={items} />
    </section>
  );
}

function ProjectSection({
  info,
  items,
}: {
  info: ProjectInfo;
  items: EnrichedIssue[];
}) {
  const totalPayout = items.reduce(
    (s, i) => s + (i.issue.estimate ? i.issue.estimate * 20 : 0),
    0,
  );
  return (
    <section>
      <ProjectSectionHeader
        info={info}
        taskCount={items.length}
        totalPayout={totalPayout}
      />
      <IssueGrid items={items} hideProject />
    </section>
  );
}

async function PPTList({ userId }: { userId: string }) {
  let issues: Issue[] = [];
  let viewerId: string | null = null;
  try {
    const linearClient = await getLinearClient(userId);
    const viewer = await linearClient.viewer;
    viewerId = viewer.id;

    const response = await linearClient.issues({
      first: 50,
      filter: {
        state: { type: { in: ["unstarted", "started"] } },
        labels: { name: { eq: "PPT" } },
      },
    });
    issues = response.nodes.sort(
      (a, b) => (b.estimate || 0) - (a.estimate || 0),
    );
  } catch (e) {
    const err = e as Error;
    console.error("Failed to fetch Linear issues:", err);
    return (
      <Alert color="red" title="Error" mb="xl">
        {err.message ||
          "Failed to fetch PPTs. Please check your Linear connection."}
      </Alert>
    );
  }

  if (issues.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">
          No available PPTs at the moment. Check back later!
        </Text>
      </Card>
    );
  }

  const projectMap = new Map<string, ProjectInfo>();

  const enriched: EnrichedIssue[] = await Promise.all(
    issues.map(async (issue) => {
      const [project, team, assignee, children] = await Promise.all([
        issue.project,
        issue.team,
        issue.assignee,
        issue.children(),
      ]);

      if (project && !projectMap.has(project.id)) {
        projectMap.set(project.id, {
          name: project.name,
          startDate: (project.startDate as string) ?? null,
          targetDate: (project.targetDate as string) ?? null,
          progress: project.progress,
          health: (project.health as string) ?? null,
        });
      }

      return {
        issue,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        teamName: team?.name ?? null,
        teamKey: team?.key ?? "other",
        assigneeName: assignee ? assignee.displayName || assignee.name : null,
        assigneeAvatarUrl: assignee?.avatarUrl ?? null,
        isAssignedToViewer: assignee?.id === viewerId,
        subIssueCount: children?.nodes?.length ?? 0,
      };
    }),
  );

  // Split into issues with projects vs team-only
  const withProject = enriched.filter((i) => i.projectId);
  const withoutProject = enriched.filter((i) => !i.projectId);

  // Group by project
  const projectGroups = new Map<
    string,
    { info: ProjectInfo; items: EnrichedIssue[] }
  >();
  for (const item of withProject) {
    const key = item.projectId as string;
    const existing = projectGroups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      const info = projectMap.get(key);
      if (info) {
        projectGroups.set(key, { info, items: [item] });
      }
    }
  }

  // Sort projects by urgency: earliest targetDate first, then by progress (least first)
  const sortedProjects = [...projectGroups.entries()].sort((a, b) => {
    const aTarget = a[1].info.targetDate;
    const bTarget = b[1].info.targetDate;
    // Projects with target dates come first
    if (aTarget && !bTarget) return -1;
    if (!aTarget && bTarget) return 1;
    if (aTarget && bTarget) {
      const diff = new Date(aTarget).getTime() - new Date(bTarget).getTime();
      if (diff !== 0) return diff;
    }
    // Then by progress (least complete first)
    return a[1].info.progress - b[1].info.progress;
  });

  // Group remaining by team
  const teamGroups = new Map<
    string,
    { teamName: string; items: EnrichedIssue[] }
  >();
  for (const item of withoutProject) {
    const key = item.teamKey;
    const existing = teamGroups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      teamGroups.set(key, {
        teamName: item.teamName || "Other",
        items: [item],
      });
    }
  }

  const sortedTeams = [...teamGroups.entries()].sort((a, b) => {
    const aTotal = a[1].items.reduce((s, i) => s + (i.issue.estimate || 0), 0);
    const bTotal = b[1].items.reduce((s, i) => s + (i.issue.estimate || 0), 0);
    return bTotal - aTotal;
  });

  // For the ticker, show all unassigned
  const unassigned = enriched.filter((i) => !i.assigneeName);

  return (
    <FadeIn>
      {unassigned.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            tt="uppercase"
            mb="xs"
            ml="xs"
            style={{ letterSpacing: "0.05em" }}
          >
            Trending PPTs
          </Text>
          <Card
            withBorder
            radius="md"
            p={0}
            style={{
              overflow: "hidden",
              background: "var(--mantine-color-dark-8)",
            }}
          >
            <Ticker
              velocity={30}
              gap={48}
              items={unassigned.slice(0, 10).map((item) => (
                <Group key={item.issue.id} wrap="nowrap" gap="xs">
                  <Badge size="xs" variant="outline" color="blue">
                    {item.issue.identifier}
                  </Badge>
                  <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                    {item.issue.title}
                  </Text>
                  <Text size="xs" c="green" fw={700}>
                    {item.issue.estimate
                      ? `RM${item.issue.estimate * 20}`
                      : "RM20 - RM100"}
                  </Text>
                  <Text size="xs" c="dimmed" mx="sm">
                    |
                  </Text>
                </Group>
              ))}
            />
          </Card>
        </div>
      )}

      {sortedProjects.length > 0 && (
        <Stack gap="xl" mb="xl">
          <Title order={2}>Projects</Title>
          {sortedProjects.map(([projectId, group]) => (
            <ProjectSection
              key={projectId}
              info={group.info}
              items={group.items}
            />
          ))}
        </Stack>
      )}

      {sortedTeams.length > 0 && (
        <Stack gap="xl">
          <Title order={2}>Teams</Title>
          {sortedTeams.map(([teamKey, group]) => (
            <TeamSection
              key={teamKey}
              teamName={group.teamName}
              items={group.items}
            />
          ))}
        </Stack>
      )}
    </FadeIn>
  );
}

export default async function PPTsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <FadeIn>
      <div style={{ marginBottom: "2rem" }}>
        <Title order={1}>PPT Board</Title>
        <Text c="dimmed" mt="xs">
          Find available tasks labeled as PPT (Pay Per Task). Claim a task to
          earn its payout.
        </Text>
      </div>

      <Suspense fallback={<PPTSkeleton />}>
        <PPTList userId={userId} />
      </Suspense>
    </FadeIn>
  );
}
