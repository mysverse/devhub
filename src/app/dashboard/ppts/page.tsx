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
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import type { ClaimButtonContext } from "@/components/ClaimButton";
import EmptyState from "@/components/EmptyState";
import InfoTip from "@/components/InfoTip";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import type { TaskAssignmentInfo } from "@/components/TaskCard";
import TaskCard from "@/components/TaskCard";
import { getSession } from "@/lib/auth-utils";
import { getClaimContext } from "@/lib/claim-context";
import type { CurrencyCode } from "@/lib/currency";
import {
  estimateToAmount,
  formatAmount,
  formatEstimate,
  getCurrencyForPaymentMethod,
} from "@/lib/currency";
import { getPptBoardIssuesForUser } from "@/lib/linear-data";
import { resolveLinearFetchError } from "@/lib/linear-error";
import type { PptBoardIssueDTO } from "@/lib/linear-queries";
import {
  applyMultiplier,
  type CampaignBadgeInfo,
  formatMultiplier,
  getCampaignWindowState,
  selectCampaignBadge,
} from "@/lib/payout-campaign";
import {
  getCampaignBadgeFor,
  getCampaignRows,
} from "@/lib/payout-campaign-server";
import { SELF_BLOCK_REASON_LABELS } from "@/lib/payout-policy";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import { getAssignmentWatchTiming } from "@/lib/ppt-assignment-watch-activity";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { ensureUserProfile } from "@/lib/user-profile";
import ActiveTasks from "../_components/ActiveTasks";
import MyPptRequests from "./MyPptRequests";
import PptBoardHelpDrawer from "./PptBoardHelpDrawer";
import PptRequestButton from "./PptRequestButton";

export const metadata: Metadata = buildSocialMetadata("/dashboard/ppts");

type EnrichedIssue = {
  issue: PptBoardIssueDTO;
  projectId: string | null;
  projectName: string | null;
  teamName: string | null;
  teamKey: string;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  isAssignedToViewer: boolean;
  subIssueCount: number;
  assignmentInfo: TaskAssignmentInfo | null;
  recentlyReleasedByViewer: boolean;
  /** Resolved per issue: label filters mean a campaign can cover some tasks
   *  on the board and not others. */
  campaign: CampaignBadgeInfo | null;
};

function agoLabel(from: Date, now: Date) {
  const hours = Math.max(
    0,
    Math.floor((now.getTime() - from.getTime()) / (60 * 60 * 1000)),
  );
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <div key={g}>
          <Skeleton height={24} width={160} mb="md" />
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {[...Array(3)].map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
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
  currency,
}: {
  info: ProjectInfo;
  taskCount: number;
  totalPayout: number;
  currency: CurrencyCode;
}) {
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
            {formatAmount(totalPayout, currency)}
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
  currency,
  claimContext,
}: {
  items: EnrichedIssue[];
  hideProject?: boolean;
  currency: CurrencyCode;
  claimContext: ClaimButtonContext;
}) {
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
              currency={currency}
              claimContext={claimContext}
              assignmentInfo={item.assignmentInfo}
              recentlyReleasedByViewer={item.recentlyReleasedByViewer}
              campaign={item.campaign}
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
  currency,
  claimContext,
}: {
  teamName: string;
  items: EnrichedIssue[];
  currency: CurrencyCode;
  claimContext: ClaimButtonContext;
}) {
  return (
    <section>
      <Group gap="sm" mb="md" align="baseline">
        <Title order={3}>{teamName}</Title>
        <Badge variant="light" color="gray" size="lg">
          {items.length} task{items.length !== 1 && "s"}
        </Badge>
      </Group>
      <IssueGrid
        items={items}
        currency={currency}
        claimContext={claimContext}
      />
    </section>
  );
}

function ProjectSection({
  info,
  items,
  currency,
  claimContext,
}: {
  info: ProjectInfo;
  items: EnrichedIssue[];
  currency: CurrencyCode;
  claimContext: ClaimButtonContext;
}) {
  // Campaign-aware so the project total agrees with the sum of its cards.
  const totalPayout = items.reduce((sum, item) => {
    if (!item.issue.estimate) return sum;
    const base = estimateToAmount(item.issue.estimate, currency);
    return (
      sum +
      (item.campaign
        ? applyMultiplier(base, item.campaign.multiplier, currency)
        : base)
    );
  }, 0);
  return (
    <section>
      <ProjectSectionHeader
        info={info}
        taskCount={items.length}
        totalPayout={totalPayout}
        currency={currency}
      />
      <IssueGrid
        items={items}
        hideProject
        currency={currency}
        claimContext={claimContext}
      />
    </section>
  );
}

async function PPTList({
  userId,
  currentLinearId,
  currency,
  claimContext,
}: {
  userId: string;
  currentLinearId: string | null;
  currency: CurrencyCode;
  claimContext: ClaimButtonContext;
}) {
  let issues: PptBoardIssueDTO[] = [];
  try {
    issues = await getPptBoardIssuesForUser(userId);
  } catch (e) {
    const message = resolveLinearFetchError(e, "/dashboard/ppts", "PPT board");
    return (
      <Alert color="red" title="Error" mb="xl">
        {message}
      </Alert>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        title="No open PPTs right now"
        description="New tasks appear here the moment they're approved — you'll also get a notification when one opens up. Working on something that should be paid? Use the Request PPT button above."
      />
    );
  }

  // One campaign fetch for the whole board; label filters are then applied per
  // issue, so a campaign scoped to "Docs" badges only the Docs cards.
  const campaignRows = await getCampaignRows();
  const liveCampaigns = campaignRows.filter(
    (row) => getCampaignWindowState(row).active,
  );
  const developerRank =
    (
      await prisma.userProfile.findUnique({
        where: { id: userId },
        select: { developerRank: true },
      })
    )?.developerRank ?? null;

  const projectMap = new Map<string, ProjectInfo>();

  // Soft workload visibility: join board issues to their assignment watches so
  // assigned cards can show "claimed Xd ago · last activity Yd ago" honestly,
  // and recently auto-released tasks show a reclaim hint to their previous
  // assignee.
  const now = new Date();
  const watchRows = await prisma.pptAssignmentWatch.findMany({
    where: {
      linearIssueId: { in: issues.map((issue) => issue.id) },
      status: { in: ["ACTIVE", "WARNED", "SNOOZED", "BLOCKED", "UNASSIGNED"] },
    },
    select: {
      linearIssueId: true,
      assigneeLinearId: true,
      userId: true,
      status: true,
      assignedAt: true,
      lastActivityAt: true,
      snoozedUntil: true,
      selfBlockReason: true,
      selfBlockExpiresAt: true,
      unassignedAt: true,
    },
  });
  const watchByKey = new Map(
    watchRows.map((watch) => [
      `${watch.linearIssueId}:${watch.assigneeLinearId}`,
      watch,
    ]),
  );
  const recentlyReleasedIssueIds = new Set(
    watchRows
      .filter(
        (watch) =>
          watch.userId === userId &&
          watch.status === "UNASSIGNED" &&
          watch.unassignedAt &&
          now.getTime() - watch.unassignedAt.getTime() < 24 * 60 * 60 * 1000,
      )
      .map((watch) => watch.linearIssueId),
  );

  const enriched: EnrichedIssue[] = issues.map((issue) => {
    const project = issue.project;
    const team = issue.team;
    const assignee = issue.assignee;

    if (project && !projectMap.has(project.id)) {
      projectMap.set(project.id, {
        name: project.name,
        startDate: project.startDate,
        targetDate: project.targetDate,
        progress: project.progress,
        health: project.health,
      });
    }

    let assignmentInfo: TaskAssignmentInfo | null = null;
    const watch = assignee
      ? watchByKey.get(`${issue.id}:${assignee.id}`)
      : undefined;
    if (watch && assignee && assignee.id !== currentLinearId) {
      const timing = getAssignmentWatchTiming({
        lastActivityAt: watch.lastActivityAt,
        status: watch.status,
        snoozedUntil: watch.snoozedUntil,
        selfBlockExpiresAt: watch.selfBlockExpiresAt,
        now,
        warningHours: claimContext.warnHours,
        unassignHours: claimContext.unassignHours,
      });
      if (timing.isBlocked) {
        assignmentInfo = {
          label: `Blocked — ${
            watch.selfBlockReason
              ? (SELF_BLOCK_REASON_LABELS[
                  watch.selfBlockReason
                ]?.toLowerCase() ?? "waiting on someone")
              : "waiting on someone"
          }`,
          tone: "orange",
        };
      } else if (watch.status !== "UNASSIGNED") {
        assignmentInfo = {
          label: `Claimed ${agoLabel(watch.assignedAt, now)} · last activity ${agoLabel(watch.lastActivityAt, now)}`,
          tone:
            timing.hoursUntilUnassign <= 12
              ? "orange"
              : timing.staleHours >= claimContext.warnHours
                ? "yellow"
                : "gray",
        };
      }
    }

    return {
      issue,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      teamName: team?.name ?? null,
      teamKey: team?.key ?? "other",
      assigneeName: assignee ? assignee.displayName || assignee.name : null,
      assigneeAvatarUrl: assignee?.avatarUrl ?? null,
      isAssignedToViewer: assignee?.id === currentLinearId,
      subIssueCount: issue.subIssueCount,
      assignmentInfo,
      recentlyReleasedByViewer:
        !assignee && recentlyReleasedIssueIds.has(issue.id),
      campaign: selectCampaignBadge(liveCampaigns, {
        scope: "PPT",
        userId,
        rank: developerRank,
        labels: issue.labelNames,
      }),
    };
  });

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
                  <Text
                    size="xs"
                    c={item.campaign ? item.campaign.accentColor : "green"}
                    fw={700}
                  >
                    {item.campaign && item.issue.estimate
                      ? `${formatMultiplier(item.campaign.multiplier)} · ${formatAmount(
                          applyMultiplier(
                            estimateToAmount(item.issue.estimate, currency),
                            item.campaign.multiplier,
                            currency,
                          ),
                          currency,
                        )}`
                      : formatEstimate(item.issue.estimate, currency)}
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
              currency={currency}
              claimContext={claimContext}
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
              currency={currency}
              claimContext={claimContext}
            />
          ))}
        </Stack>
      )}
    </FadeIn>
  );
}

/**
 * Streams the campaign into the request button so the page shell stays static.
 * Labels are deliberately not passed: a request has no Linear issue yet, so a
 * label-restricted campaign must not be quoted in the modal.
 */
async function PptRequestButtonWithCampaign() {
  const { userId } = await getSession();
  if (!userId) return <PptRequestButton />;

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { developerRank: true },
  });

  const campaign = await getCampaignBadgeFor({
    scope: "PPT",
    userId,
    rank: profile?.developerRank ?? null,
  });

  return <PptRequestButton campaign={campaign} />;
}

export default function PPTsPage({
  searchParams,
}: {
  searchParams: Promise<{ requestsPage?: string }>;
}) {
  return (
    <PageContainer>
      <PageHeader
        title="PPT Board"
        subtitle={
          <Stack gap={6}>
            <Text c="dimmed">
              Find available tasks labeled as PPT (Pay Per Task). Claim a task
              to earn its payout.
            </Text>
            <PptBoardHelpDrawer policy={getResolvedPayoutPolicy()} />
          </Stack>
        }
        action={
          <Suspense fallback={<PptRequestButton />}>
            <PptRequestButtonWithCampaign />
          </Suspense>
        }
      />
      <Suspense fallback={<PPTSkeleton />}>
        <PPTsPageContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function PPTsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ requestsPage?: string }>;
}) {
  const { userId, user } = await getSession();
  if (!userId) redirect("/");

  const params = await searchParams;
  const requestsPage = Math.max(
    1,
    Number.parseInt(params.requestsPage ?? "1", 10) || 1,
  );

  const userProfile = await ensureUserProfile({
    userId,
    name: user?.name,
    email: user?.email,
  });
  const userCurrency = getCurrencyForPaymentMethod(
    userProfile?.paymentMethod ?? "PAYPAL",
  );
  const claimContext = await getClaimContext(userId);

  return (
    <Stack gap="xl">
      {claimContext.activeCount > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <StatCard
            label={
              <Group gap={4} wrap="nowrap" component="span">
                My active PPTs
                <InfoTip term="assignmentWatch" />
              </Group>
            }
            value={claimContext.activeCount}
            hint={`Tasks you've claimed that aren't done — each has a ${claimContext.unassignHours}h activity timer`}
          />
        </SimpleGrid>
      )}

      {userProfile?.linearId && (
        <Suspense>
          <ActiveTasks
            linearId={userProfile.linearId}
            userId={userId}
            currency={userCurrency}
            heading="Your active PPTs"
            subtitle="Payout progress for the tasks you've claimed"
            showBoardLink={false}
            hideWhenEmpty
          />
        </Suspense>
      )}

      <Suspense fallback={<PPTSkeleton />}>
        <PPTList
          userId={userId}
          currentLinearId={userProfile?.linearId ?? null}
          currency={userCurrency}
          claimContext={claimContext}
        />
      </Suspense>

      <Suspense>
        <MyPptRequests
          userId={userId}
          currency={userCurrency}
          page={requestsPage}
        />
      </Suspense>
    </Stack>
  );
}
