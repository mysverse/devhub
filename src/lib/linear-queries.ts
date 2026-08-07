import type { LinearClient } from "@linear/sdk";
import { linearEstimateToComplexityLevel } from "@/lib/currency";
import {
  DEVHUB_ASSIGNED_ACTIVE_ISSUES_QUERY,
  DEVHUB_ISSUES_BY_IDS_QUERY,
  DEVHUB_LEADERBOARD_PPT_ISSUES_QUERY,
  DEVHUB_PPT_BOARD_ISSUES_QUERY,
  DEVHUB_SUGGESTED_PPTS_QUERY,
  DEVHUB_TEAM_WORKFLOW_STATES_QUERY,
} from "@/lib/linear-documents";

export type LinearAssigneeDTO = {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
};

export type IssueDTO = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  estimate: number | null;
  dueDate: string | null;
  stateType: string;
  stateName: string;
  assignee: LinearAssigneeDTO | null;
  labelNames: string[];
};

export type PptBoardIssueDTO = IssueDTO & {
  project: {
    id: string;
    name: string;
    startDate: string | null;
    targetDate: string | null;
    progress: number;
    health: string | null;
  } | null;
  team: {
    id: string;
    name: string;
    key: string;
  } | null;
  subIssueCount: number;
};

export type WorkflowStateDTO = {
  id: string;
  name: string;
  type: string;
};

type RawLinearClient = LinearClient & {
  client: {
    rawRequest<TData, TVariables extends Record<string, unknown> | undefined>(
      query: string,
      variables?: TVariables,
    ): Promise<{ data: TData }>;
  };
};

type RawIssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  estimate?: number | null;
  dueDate?: string | null;
  state?: { type?: string | null; name?: string | null } | null;
  assignee?: {
    id: string;
    name?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  labels?: { nodes?: { name?: string | null }[] | null } | null;
};

type RawPptBoardIssueNode = RawIssueNode & {
  project?: {
    id: string;
    name: string;
    startDate?: string | null;
    targetDate?: string | null;
    progress?: number | null;
    health?: string | null;
  } | null;
  team?: { id: string; name: string; key: string } | null;
  children?: { nodes?: { id: string }[] | null } | null;
};

async function gql<TData, TVariables extends Record<string, unknown>>(
  client: LinearClient,
  query: string,
  variables: TVariables,
) {
  const response = await (client as RawLinearClient).client.rawRequest<
    TData,
    TVariables
  >(query, variables);
  if (!response.data) {
    throw new Error("Linear GraphQL response did not include data");
  }
  return response.data;
}

function labelNames(issue: RawIssueNode) {
  return (issue.labels?.nodes ?? [])
    .map((label) => label.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function assignee(issue: RawIssueNode): LinearAssigneeDTO | null {
  if (!issue.assignee) return null;
  return {
    id: issue.assignee.id,
    name: issue.assignee.name ?? issue.assignee.displayName ?? "Unknown",
    displayName: issue.assignee.displayName ?? issue.assignee.name ?? "Unknown",
    avatarUrl: issue.assignee.avatarUrl ?? null,
  };
}

function issueDto(issue: RawIssueNode): IssueDTO {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description ?? null,
    estimate: linearEstimateToComplexityLevel(issue.estimate),
    dueDate: issue.dueDate ?? null,
    stateType: issue.state?.type ?? "unknown",
    stateName: issue.state?.name ?? "Unknown",
    assignee: assignee(issue),
    labelNames: labelNames(issue),
  };
}

function pptBoardIssueDto(issue: RawPptBoardIssueNode): PptBoardIssueDTO {
  return {
    ...issueDto(issue),
    project: issue.project
      ? {
          id: issue.project.id,
          name: issue.project.name,
          startDate: issue.project.startDate ?? null,
          targetDate: issue.project.targetDate ?? null,
          progress: issue.project.progress ?? 0,
          health: issue.project.health ?? null,
        }
      : null,
    team: issue.team
      ? {
          id: issue.team.id,
          name: issue.team.name,
          key: issue.team.key,
        }
      : null,
    subIssueCount: issue.children?.nodes?.length ?? 0,
  };
}

export async function fetchLeaderboardIssues(client: LinearClient) {
  const data = await gql<
    { issues: { nodes: RawIssueNode[] } },
    Record<string, never>
  >(client, DEVHUB_LEADERBOARD_PPT_ISSUES_QUERY, {});

  return data.issues.nodes.map(issueDto);
}

export async function fetchAssignedActiveIssues(
  client: LinearClient,
  linearId: string,
) {
  const data = await gql<
    { issues: { nodes: RawIssueNode[] } },
    { linearId: string }
  >(client, DEVHUB_ASSIGNED_ACTIVE_ISSUES_QUERY, { linearId });

  return data.issues.nodes.map(issueDto);
}

export async function fetchSuggestedPpts(client: LinearClient) {
  const data = await gql<
    { issues: { nodes: RawIssueNode[] } },
    Record<string, never>
  >(client, DEVHUB_SUGGESTED_PPTS_QUERY, {});

  return data.issues.nodes
    .map(issueDto)
    .sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0));
}

export async function fetchPptBoardIssues(client: LinearClient) {
  const data = await gql<
    { issues: { nodes: RawPptBoardIssueNode[] } },
    Record<string, never>
  >(client, DEVHUB_PPT_BOARD_ISSUES_QUERY, {});

  return data.issues.nodes
    .map(pptBoardIssueDto)
    .sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0));
}

export async function fetchIssuesByIds(client: LinearClient, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const data = await gql<
    { issues: { nodes: RawIssueNode[] } },
    { ids: string[]; first: number }
  >(client, DEVHUB_ISSUES_BY_IDS_QUERY, {
    ids: uniqueIds,
    first: uniqueIds.length,
  });

  return data.issues.nodes.map(issueDto);
}

export async function fetchTeamWorkflowStates(
  client: LinearClient,
  teamId: string,
) {
  const data = await gql<
    {
      team: {
        states: {
          nodes: WorkflowStateDTO[];
        };
      } | null;
    },
    { teamId: string }
  >(client, DEVHUB_TEAM_WORKFLOW_STATES_QUERY, { teamId });

  return data.team?.states.nodes ?? [];
}

export async function findTodoWorkflowStateId(
  client: LinearClient,
  teamId: string,
) {
  const states = await fetchTeamWorkflowStates(client, teamId);
  return (
    states.find(
      (state) =>
        state.type === "unstarted" &&
        state.name.trim().toLowerCase() === "todo",
    )?.id ??
    states.find((state) => state.type === "unstarted")?.id ??
    null
  );
}
