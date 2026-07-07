/**
 * Mock Linear API. Answers the GraphQL operations this codebase actually
 * uses (the @linear/sdk generated operations plus the raw DevHub* queries in
 * src/lib/linear-queries.ts) from the in-memory workspace in src/dev/state.ts.
 * Unknown operations and filter shapes throw loudly with the file to edit.
 */

import {
  getLinearUser,
  LINEAR_ORG_URL,
  LINEAR_PROJECT,
  LINEAR_STATES,
  LINEAR_TEAM,
  LINEAR_USERS,
} from "@/dev/fixtures/linear";
import { PERSONAS } from "@/dev/fixtures/personas";
import type { DevHandler } from "@/dev/intercept";
import { getDevState, type MockLinearIssue, stateById } from "@/dev/state";
import {
  formatLinearDocumentValidationErrors,
  validateLinearGraphqlDocument,
} from "@/lib/linear-document-validation";

const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAKAv1oU3gAAAABJRU5ErkJggg==",
  "base64",
);

type GraphQLRequest = {
  query: string;
  variables?: Record<string, unknown>;
};

type Json = Record<string, unknown>;

function unknownOperation(detail: string, query?: string): Error {
  return new Error(
    `[dev-mode] Mock Linear API: ${detail}.\n` +
      `Add support in src/dev/handlers/linear.ts (and fixtures in src/dev/fixtures/linear.ts if needed).` +
      (query ? `\nQuery: ${query.slice(0, 300)}` : ""),
  );
}

// ── Viewer resolution ─────────────────────────────────────────────────────────

function viewerLinearIdForToken(authorization: string | null): string {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const personaMatch = /^mock-linear-access-token-(\w+)$/.exec(token);
  if (personaMatch) {
    const persona = PERSONAS[personaMatch[1] as keyof typeof PERSONAS];
    if (persona?.linearId) return persona.linearId;
  }
  if (token === process.env.LINEAR_SERVICE_API_KEY) {
    // Service account acts as the admin user.
    return PERSONAS.admin.linearId as string;
  }
  throw unknownOperation(
    `unrecognised Authorization token "${token.slice(0, 40)}"`,
  );
}

// ── Node builders ─────────────────────────────────────────────────────────────

const PAGE_INFO = {
  __typename: "PageInfo",
  startCursor: null,
  endCursor: null,
  hasPreviousPage: false,
  hasNextPage: false,
};

function connection(nodes: Json[]): Json {
  return { nodes, pageInfo: PAGE_INFO };
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** Issue in the @linear/sdk fragment shape (relations as { id } refs). */
function sdkIssueNode(issue: MockLinearIssue): Json {
  const labelIds = getDevState()
    .linear.labels.filter((label) => issue.labelNames.includes(label.name))
    .map((label) => label.id);
  return {
    __typename: "Issue",
    id: issue.id,
    identifier: issue.identifier,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    url: issue.url,
    branchName: issue.identifier.toLowerCase(),
    estimate: issue.estimate,
    priority: 0,
    priorityLabel: "No priority",
    previousIdentifiers: [],
    reactionData: [],
    reactions: [],
    sharedAccess: {
      __typename: "IssueSharedAccess",
      isShared: false,
      sharedWithCount: 0,
      sharedWithUsers: [],
      viewerHasOnlySharedAccess: false,
      disallowedIssueFields: [],
    },
    labelIds,
    customerTicketCount: 0,
    boardOrder: 0,
    sortOrder: 0,
    prioritySortOrder: 0,
    subIssueSortOrder: 0,
    dueDate: null,
    createdAt: iso(issue.createdAt),
    updatedAt: iso(issue.updatedAt),
    completedAt: iso(issue.completedAt),
    canceledAt: iso(issue.canceledAt),
    archivedAt: iso(issue.archivedAt),
    startedAt:
      issue.stateId === LINEAR_STATES.started.id ? iso(issue.createdAt) : null,
    trashed: issue.trashed,
    state: { id: issue.stateId },
    assignee: issue.assigneeId ? { id: issue.assigneeId } : null,
    creator: { id: issue.assigneeId ?? (PERSONAS.admin.linearId as string) },
    team: { id: issue.teamId },
    project: issue.projectId ? { id: issue.projectId } : null,
    parent: null,
    cycle: null,
    snoozedBy: null,
    favorite: null,
    delegate: null,
    botActor: null,
    sourceComment: null,
    projectMilestone: null,
    lastAppliedTemplate: null,
    recurringIssueTemplate: null,
    externalUserCreator: null,
  };
}

/** Issue in the shape of the raw DevHub* queries (src/lib/linear-queries.ts). */
function rawIssueNode(issue: MockLinearIssue, board = false): Json {
  const state = stateById(issue.stateId);
  const assignee = issue.assigneeId ? getLinearUser(issue.assigneeId) : null;
  const node: Json = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description,
    estimate: issue.estimate,
    state: { type: state.type, name: state.name },
    assignee: assignee
      ? {
          id: assignee.id,
          name: assignee.name,
          displayName: assignee.displayName,
          avatarUrl: assignee.avatarUrl,
        }
      : null,
    labels: { nodes: issue.labelNames.map((name) => ({ name })) },
  };
  if (board) {
    node.project = issue.projectId
      ? {
          id: LINEAR_PROJECT.id,
          name: LINEAR_PROJECT.name,
          startDate: new Date(
            Date.now() - LINEAR_PROJECT.startDaysAgo * 86_400_000,
          )
            .toISOString()
            .slice(0, 10),
          targetDate: new Date(
            Date.now() + LINEAR_PROJECT.targetDaysAhead * 86_400_000,
          )
            .toISOString()
            .slice(0, 10),
          progress: LINEAR_PROJECT.progress,
          health: LINEAR_PROJECT.health,
        }
      : null;
    node.team = {
      id: LINEAR_TEAM.id,
      name: LINEAR_TEAM.name,
      key: LINEAR_TEAM.key,
    };
    node.children = { nodes: [] };
  }
  return node;
}

function assignmentWatchIssueNode(issue: MockLinearIssue): Json {
  const state = stateById(issue.stateId);
  const assignee = issue.assigneeId ? getLinearUser(issue.assigneeId) : null;
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description,
    estimate: issue.estimate,
    createdAt: iso(issue.createdAt),
    updatedAt: iso(issue.updatedAt),
    state: { type: state.type, name: state.name },
    assignee: assignee
      ? {
          id: assignee.id,
          email: assignee.email,
          name: assignee.name,
          displayName: assignee.displayName,
        }
      : null,
    labels: { nodes: issue.labelNames.map((name) => ({ name })) },
    comments: connection(commentNodes(issue)),
    history: connection(historyNodes(issue)),
  };
}

function userNode(linearId: string): Json {
  const user = getLinearUser(linearId);
  return {
    __typename: "User",
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    active: true,
    admin: user.id === PERSONAS.admin.linearId,
    guest: false,
    isMe: false,
    initials: user.name
      .split(" ")
      .map((part) => part[0])
      .join(""),
    url: `${LINEAR_ORG_URL}/profiles/${user.displayName}`,
    timezone: "Asia/Kuala_Lumpur",
    createdIssueCount: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    archivedAt: null,
    lastSeen: new Date().toISOString(),
    statusEmoji: null,
    statusLabel: null,
    statusUntilAt: null,
    description: null,
    disableReason: null,
  };
}

function workflowStateNode(stateId: string): Json {
  const state = stateById(stateId);
  return {
    __typename: "WorkflowState",
    id: state.id,
    name: state.name,
    type: state.type,
    color: state.color,
    position: 0,
    description: null,
    inheritedFrom: null,
    team: { id: LINEAR_TEAM.id },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function teamNode(): Json {
  return {
    __typename: "Team",
    id: LINEAR_TEAM.id,
    key: LINEAR_TEAM.key,
    name: LINEAR_TEAM.name,
    description: "Mock workspace team",
    private: false,
    color: "#5e6ad2",
    icon: null,
    timezone: "Asia/Kuala_Lumpur",
    inviteHash: "mock-invite-hash",
    issueCount: getDevState().linear.issues.size,
    cycleDuration: 1,
    cyclesEnabled: false,
    issueEstimationType: "exponential",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    archivedAt: null,
    parent: null,
  };
}

function projectNode(): Json {
  return {
    __typename: "Project",
    id: LINEAR_PROJECT.id,
    name: LINEAR_PROJECT.name,
    slugId: "project-sentinel",
    description: "Mock project",
    content: null,
    icon: null,
    color: "#5e6ad2",
    state: "started",
    status: { id: "project-status-started" },
    priority: 0,
    prioritySortOrder: 0,
    sortOrder: 0,
    progress: LINEAR_PROJECT.progress,
    health: LINEAR_PROJECT.health,
    url: `${LINEAR_ORG_URL}/project/project-sentinel`,
    startDate: new Date(Date.now() - LINEAR_PROJECT.startDaysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10),
    targetDate: new Date(
      Date.now() + LINEAR_PROJECT.targetDaysAhead * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    archivedAt: null,
    creator: { id: PERSONAS.admin.linearId },
    lead: { id: PERSONAS.admin.linearId },
    favorite: null,
    lastAppliedTemplate: null,
  };
}

function commentNodes(issue: MockLinearIssue): Json[] {
  return issue.comments.map((comment) => ({
    __typename: "Comment",
    id: comment.id,
    body: comment.body,
    url: `${issue.url}#comment-${comment.id}`,
    createdAt: iso(comment.createdAt),
    updatedAt: iso(comment.createdAt),
    editedAt: null,
    archivedAt: null,
    user: { id: comment.userId },
    userId: comment.userId,
    issueId: issue.id,
    parentId: null,
    projectId: null,
    initiativeId: null,
    documentContentId: null,
    resolvingCommentId: null,
    resolvingUser: null,
    resolvedAt: null,
    reactionData: [],
    reactions: [],
    quotedText: null,
    summaryText: null,
    threadSummary: null,
    botActor: null,
    externalUser: null,
    parent: null,
    resolvingComment: null,
    agentSession: null,
  }));
}

/** Synthesised assignment/completion history (ppt-eligibility reads these). */
function historyNodes(issue: MockLinearIssue): Json[] {
  const nodes: Json[] = [];
  if (issue.assigneeId) {
    nodes.push({
      __typename: "IssueHistory",
      id: `history-${issue.id}-assigned`,
      createdAt: iso(issue.createdAt),
      updatedAt: iso(issue.createdAt),
      archivedAt: null,
      actorId: issue.assigneeId,
      actor: { id: issue.assigneeId },
      fromAssigneeId: null,
      toAssigneeId: issue.assigneeId,
      fromAssignee: null,
      toAssignee: { id: issue.assigneeId },
      fromStateId: null,
      toStateId: null,
      issue: { id: issue.id },
    });
  }
  const closedAt = issue.completedAt ?? issue.canceledAt;
  if (closedAt) {
    nodes.push({
      __typename: "IssueHistory",
      id: `history-${issue.id}-closed`,
      createdAt: iso(closedAt),
      updatedAt: iso(closedAt),
      archivedAt: null,
      actorId: issue.assigneeId,
      actor: issue.assigneeId ? { id: issue.assigneeId } : null,
      fromAssigneeId: null,
      toAssigneeId: null,
      fromStateId: LINEAR_STATES.started.id,
      toStateId: issue.stateId,
      issue: { id: issue.id },
    });
  }
  return nodes;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

type IssueFilter = Record<string, unknown>;

function matchesFilter(
  issue: MockLinearIssue,
  filter: IssueFilter,
  query: string,
): boolean {
  for (const [key, raw] of Object.entries(filter)) {
    const condition = raw as Record<string, unknown>;
    switch (key) {
      case "labels": {
        const eq = (condition.name as Record<string, unknown> | undefined)?.eq;
        if (typeof eq !== "string" || !issue.labelNames.includes(eq)) {
          return false;
        }
        break;
      }
      case "assignee": {
        if ("null" in condition) {
          const wantNull = condition.null as boolean;
          if (wantNull !== (issue.assigneeId === null)) return false;
        } else if ("id" in condition) {
          const eq = (condition.id as Record<string, unknown>).eq;
          if (issue.assigneeId !== eq) return false;
        } else {
          throw unknownOperation(
            `unsupported assignee filter ${JSON.stringify(condition)}`,
            query,
          );
        }
        break;
      }
      case "state": {
        const type = condition.type as Record<string, unknown> | undefined;
        if (!type) {
          throw unknownOperation(
            `unsupported state filter ${JSON.stringify(condition)}`,
            query,
          );
        }
        const stateType = stateById(issue.stateId).type;
        if ("eq" in type && stateType !== type.eq) return false;
        if ("in" in type && !(type.in as string[]).includes(stateType)) {
          return false;
        }
        if ("nin" in type && (type.nin as string[]).includes(stateType)) {
          return false;
        }
        break;
      }
      case "id": {
        const ids = (condition as Record<string, unknown>).in as string[];
        if (!ids?.includes(issue.id)) return false;
        break;
      }
      case "completedAt": {
        const gte = (condition as Record<string, unknown>).gte;
        if (typeof gte === "string" || gte instanceof Date) {
          const cutoff = new Date(gte as string | Date).getTime();
          if (!issue.completedAt || issue.completedAt.getTime() < cutoff) {
            return false;
          }
        } else {
          throw unknownOperation(
            `unsupported completedAt filter ${JSON.stringify(condition)}`,
            query,
          );
        }
        break;
      }
      default:
        throw unknownOperation(`unsupported issue filter key "${key}"`, query);
    }
  }
  return true;
}

function filteredIssues(variables: Record<string, unknown>, query: string) {
  const issues = [...getDevState().linear.issues.values()];
  const filter = (variables.filter ?? null) as IssueFilter | null;
  const first = typeof variables.first === "number" ? variables.first : 50;
  const matched = filter
    ? issues.filter((issue) => matchesFilter(issue, filter, query))
    : issues;
  return matched.slice(0, first);
}

function requireIssue(id: unknown): MockLinearIssue {
  const { issues } = getDevState().linear;
  const issue =
    issues.get(id as string) ??
    [...issues.values()].find((candidate) => candidate.identifier === id);
  if (!issue) {
    throw unknownOperation(`no mock issue with id "${id}"`);
  }
  return issue;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

let lastSyncId = 1000;

function applyIssueInput(
  issue: MockLinearIssue,
  input: Record<string, unknown>,
): void {
  const { linear } = getDevState();
  if (typeof input.title === "string") issue.title = input.title;
  if ("description" in input) {
    issue.description = (input.description as string | null) ?? null;
  }
  if ("estimate" in input) issue.estimate = (input.estimate as number) ?? null;
  if ("assigneeId" in input) {
    issue.assigneeId = (input.assigneeId as string | null) ?? null;
  }
  if ("projectId" in input) {
    issue.projectId = (input.projectId as string | null) ?? null;
  }
  if (typeof input.stateId === "string") {
    const state = stateById(input.stateId);
    issue.stateId = state.id;
    issue.completedAt = state.type === "completed" ? new Date() : null;
    issue.canceledAt = state.type === "canceled" ? new Date() : null;
  }
  if (Array.isArray(input.labelIds)) {
    issue.labelNames = (input.labelIds as string[])
      .map(
        (labelId) => linear.labels.find((label) => label.id === labelId)?.name,
      )
      .filter((name): name is string => Boolean(name));
  }
  issue.updatedAt = new Date();
}

// ── Operation dispatch ────────────────────────────────────────────────────────

function executeOperation(
  operation: string,
  variables: Record<string, unknown>,
  query: string,
  authorization: string | null,
): Json {
  const state = getDevState().linear;

  switch (operation) {
    // Raw queries from src/lib/linear-queries.ts
    case "DevHubLeaderboardPptIssues":
    case "DevHubAssignedActiveIssues":
    case "DevHubSuggestedPpts":
    case "DevHubIssuesByIds": {
      const filter = inlineFilterFor(operation, variables);
      return {
        issues: {
          nodes: [...state.issues.values()]
            .filter((issue) => matchesFilter(issue, filter, query))
            .map((issue) => rawIssueNode(issue)),
        },
      };
    }
    case "DevHubPptBoardIssues": {
      const filter = inlineFilterFor(operation, variables);
      return {
        issues: {
          nodes: [...state.issues.values()]
            .filter((issue) => matchesFilter(issue, filter, query))
            .map((issue) => rawIssueNode(issue, true)),
        },
      };
    }

    // SDK queries
    case "viewer":
      return { viewer: userNode(viewerLinearIdForToken(authorization)) };
    case "issues":
      return {
        issues: connection(
          filteredIssues(variables, query).map((issue) => sdkIssueNode(issue)),
        ),
      };
    case "issue":
      return { issue: sdkIssueNode(requireIssue(variables.id)) };
    case "issue_labels": {
      const issue = requireIssue(variables.id);
      const labels = state.labels.filter((label) =>
        issue.labelNames.includes(label.name),
      );
      return {
        issue: {
          labels: connection(
            labels.map((label) => ({
              __typename: "IssueLabel",
              ...label,
              isGroup: false,
              description: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
              archivedAt: null,
              parent: null,
              team: { id: LINEAR_TEAM.id },
              creator: null,
            })),
          ),
        },
      };
    }
    case "issue_comments":
      return {
        issue: {
          comments: connection(commentNodes(requireIssue(variables.id))),
        },
      };
    case "issue_history":
      return {
        issue: {
          history: connection(historyNodes(requireIssue(variables.id))),
        },
      };
    case "issue_children":
      return { issue: { children: connection([]) } };
    case "workflowState":
      return { workflowState: workflowStateNode(variables.id as string) };
    case "user":
      return { user: userNode(variables.id as string) };
    case "users":
      return { users: connection(LINEAR_USERS.map((u) => userNode(u.id))) };
    case "user_teamMemberships":
      return {
        user: {
          teamMemberships: connection([
            {
              __typename: "TeamMembership",
              id: `membership-${variables.id}`,
              owner: false,
              sortOrder: 0,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
              archivedAt: null,
              team: { id: LINEAR_TEAM.id },
              user: { id: variables.id },
            },
          ]),
        },
      };
    case "teams":
      return { teams: connection([teamNode()]) };
    case "team":
      return { team: teamNode() };
    case "team_projects":
      return { team: { projects: connection([projectNode()]) } };
    case "project":
      return { project: projectNode() };
    case "project_members":
      return {
        project: {
          members: connection(LINEAR_USERS.map((u) => userNode(u.id))),
        },
      };
    case "DevHubTeamWorkflowStates":
      return {
        team: {
          states: connection(
            Object.values(LINEAR_STATES).map((state) => ({
              id: state.id,
              name: state.name,
              type: state.type,
            })),
          ),
        },
      };
    case "issueLabels": {
      const filter = variables.filter as { name?: { eq?: string } } | undefined;
      const labels = filter?.name?.eq
        ? state.labels.filter((label) => label.name === filter.name?.eq)
        : state.labels;
      return {
        issueLabels: connection(
          labels.map((label) => ({
            __typename: "IssueLabel",
            ...label,
            isGroup: false,
            description: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            archivedAt: null,
            parent: null,
            team: null,
            creator: null,
          })),
        ),
      };
    }
    case "searchIssues": {
      const term = String(variables.term ?? "").toLowerCase();
      const matches = [...state.issues.values()].filter(
        (issue) =>
          issue.title.toLowerCase().includes(term) ||
          issue.identifier.toLowerCase().includes(term),
      );
      return {
        searchIssues: {
          __typename: "IssueSearchPayload",
          nodes: matches.map((issue) => ({
            ...sdkIssueNode(issue),
            __typename: "IssueSearchResult",
            metadata: {},
          })),
          pageInfo: PAGE_INFO,
          totalCount: matches.length,
          archivePayload: {
            __typename: "ArchiveResponse",
            archive: "",
            totalCount: 0,
            databaseVersion: 0,
            includesDependencies: false,
          },
        },
      };
    }
    case "DevHubPptAssignmentWatchIssues": {
      const filter = inlineFilterFor(operation, variables);
      return {
        issues: {
          nodes: [...state.issues.values()]
            .filter((issue) => matchesFilter(issue, filter, query))
            .map((issue) => assignmentWatchIssueNode(issue)),
        },
      };
    }

    // Mutations
    case "updateIssue": {
      const issue = requireIssue(variables.id);
      applyIssueInput(
        issue,
        (variables.input ?? {}) as Record<string, unknown>,
      );
      return {
        issueUpdate: {
          __typename: "IssuePayload",
          lastSyncId: ++lastSyncId,
          issue: { id: issue.id },
          success: true,
        },
      };
    }
    case "createIssue": {
      const input = (variables.input ?? {}) as Record<string, unknown>;
      const number = state.nextIssueNumber++;
      const identifier = `${LINEAR_TEAM.key}-${number}`;
      const issue: MockLinearIssue = {
        id: `issue-${LINEAR_TEAM.key.toLowerCase()}-${number}`,
        identifier,
        number,
        title: String(input.title ?? "Untitled"),
        description: (input.description as string | null) ?? null,
        estimate: (input.estimate as number | null) ?? null,
        stateId: LINEAR_STATES.unstarted.id,
        assigneeId: null,
        labelNames: [],
        teamId: (input.teamId as string) ?? LINEAR_TEAM.id,
        projectId: null,
        url: `${LINEAR_ORG_URL}/issue/${identifier}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        trashed: false,
        comments: [],
      };
      state.issues.set(issue.id, issue);
      applyIssueInput(issue, input);
      return {
        issueCreate: {
          __typename: "IssuePayload",
          lastSyncId: ++lastSyncId,
          issue: { id: issue.id },
          success: true,
        },
      };
    }
    case "fileUpload": {
      const contentType = String(
        variables.contentType ?? "application/octet-stream",
      );
      const filename = String(variables.filename ?? "attachment");
      const size = Number(variables.size ?? 0);
      const id = `upload-${++lastSyncId}`;
      const assetUrl = `https://uploads.linear.app/devhub/${id}/${encodeURIComponent(filename)}`;
      return {
        fileUpload: {
          __typename: "UploadPayload",
          lastSyncId,
          success: true,
          uploadFile: {
            __typename: "UploadFile",
            assetUrl,
            uploadUrl: assetUrl,
            contentType,
            filename,
            size,
            metaData: null,
            headers: [
              {
                __typename: "UploadFileHeader",
                key: "content-type",
                value: contentType,
              },
            ],
          },
        },
      };
    }
    case "createComment": {
      const input = (variables.input ?? {}) as Record<string, unknown>;
      const issue = requireIssue(input.issueId);
      const comment = {
        id: `comment-dev-${state.nextCommentNumber++}`,
        body: String(input.body ?? ""),
        userId: PERSONAS.admin.linearId as string,
        createdAt: new Date(),
      };
      issue.comments.push(comment);
      return {
        commentCreate: {
          __typename: "CommentPayload",
          lastSyncId: ++lastSyncId,
          comment: { id: comment.id },
          success: true,
        },
      };
    }
    case "createIssueLabel": {
      const input = (variables.input ?? {}) as Record<string, unknown>;
      const label = {
        id: `label-dev-${state.labels.length + 1}`,
        name: String(input.name ?? "Label"),
        color: String(input.color ?? "#26b5ce"),
      };
      state.labels.push(label);
      return {
        issueLabelCreate: {
          __typename: "IssueLabelPayload",
          lastSyncId: ++lastSyncId,
          issueLabel: { id: label.id },
          success: true,
        },
      };
    }
    case "updateProject":
      return {
        projectUpdate: {
          __typename: "ProjectPayload",
          lastSyncId: ++lastSyncId,
          project: { id: variables.id ?? LINEAR_PROJECT.id },
          success: true,
        },
      };
    case "createTeamMembership":
      return {
        teamMembershipCreate: {
          __typename: "TeamMembershipPayload",
          lastSyncId: ++lastSyncId,
          teamMembership: { id: "membership-created" },
          success: true,
        },
      };
    case "deleteTeamMembership":
      return {
        teamMembershipDelete: {
          __typename: "DeletePayload",
          lastSyncId: ++lastSyncId,
          entityId: variables.id,
          success: true,
        },
      };

    default:
      throw unknownOperation(`unhandled operation "${operation}"`, query);
  }
}

/**
 * The DevHub* raw queries inline most of their filters in the query text
 * rather than variables — mirror them here (source of truth: the query
 * strings in src/lib/linear-queries.ts).
 */
function inlineFilterFor(
  operation: string,
  variables: Record<string, unknown>,
): IssueFilter {
  switch (operation) {
    case "DevHubLeaderboardPptIssues":
      return { labels: { name: { eq: "PPT" } }, assignee: { null: false } };
    case "DevHubAssignedActiveIssues":
      return {
        assignee: { id: { eq: variables.linearId } },
        state: { type: { nin: ["completed", "canceled"] } },
      };
    case "DevHubSuggestedPpts":
      return {
        assignee: { null: true },
        state: { type: { in: ["backlog", "unstarted"] } },
        labels: { name: { eq: "PPT" } },
      };
    case "DevHubPptBoardIssues":
      return {
        state: { type: { in: ["backlog", "unstarted", "started"] } },
        labels: { name: { eq: "PPT" } },
      };
    case "DevHubPptAssignmentWatchIssues":
      return {
        state: { type: { in: ["backlog", "unstarted", "started"] } },
        assignee: { null: false },
        labels: { name: { eq: "PPT" } },
      };
    case "DevHubIssuesByIds":
      return { id: { in: variables.ids } };
    default:
      throw unknownOperation(`no inline filter mapping for "${operation}"`);
  }
}

// ── HTTP entrypoint ───────────────────────────────────────────────────────────

export const handleLinear: DevHandler = async (req, url) => {
  if (url.hostname === "uploads.linear.app") {
    const key = url.pathname;
    const state = getDevState();
    if (req.method === "PUT") {
      const bytes = new Uint8Array(await req.arrayBuffer());
      state.blobs.set(key, {
        contentType:
          req.headers.get("content-type") ?? "application/octet-stream",
        bytes,
      });
      return new Response(null, { status: 200 });
    }
    if (req.method === "GET") {
      const blob = state.blobs.get(key);
      if (!blob) {
        if (/\.(png|jpe?g|webp|gif)$/i.test(key)) {
          return new Response(PLACEHOLDER_PNG, {
            headers: { "content-type": "image/png" },
          });
        }
        return new Response("Not found", { status: 404 });
      }
      return new Response(Buffer.from(blob.bytes), {
        headers: { "content-type": blob.contentType },
      });
    }
  }

  if (url.pathname === "/oauth/token" && req.method === "POST") {
    const body = new URLSearchParams(await req.text());
    const refreshToken = body.get("refresh_token") ?? "";
    const personaKey =
      /^mock-linear-refresh-token-(\w+)$/.exec(refreshToken)?.[1] ??
      "developer";
    return Response.json({
      access_token: `mock-linear-access-token-${personaKey}`,
      refresh_token: `mock-linear-refresh-token-${personaKey}`,
      token_type: "Bearer",
      expires_in: 86_400,
      scope: "read,write,issues:create",
    });
  }

  if (url.pathname === "/graphql" && req.method === "POST") {
    const { query, variables = {} } = (await req.json()) as GraphQLRequest;
    const named = /^\s*(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(query);
    const anonymousRoot = /^\s*(?:query\s*)?\{\s*([A-Za-z0-9_]+)/.exec(query);
    const operation = named?.[1] ?? anonymousRoot?.[1];
    if (!operation) {
      throw unknownOperation("could not parse operation name", query);
    }
    if (operation.startsWith("DevHub")) {
      const validationErrors = validateLinearGraphqlDocument(query);
      if (validationErrors.length > 0) {
        return Response.json(
          {
            errors: validationErrors.map((error) => ({
              message: formatLinearDocumentValidationErrors(operation, [error]),
            })),
          },
          { status: 400 },
        );
      }
    }
    const data = executeOperation(
      operation,
      variables,
      query,
      req.headers.get("authorization"),
    );
    return Response.json({ data });
  }

  throw unknownOperation(`unhandled request ${req.method} ${url.pathname}`);
};
