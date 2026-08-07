const DEVHUB_ISSUE_FIELDS = `
  fragment DevHubIssueFields on Issue {
    id
    identifier
    title
    url
    description
    estimate
    dueDate
    state { type name }
    assignee { id name displayName avatarUrl }
    labels(first: 50) { nodes { name } }
  }
`;

const DEVHUB_PPT_BOARD_ISSUE_FIELDS = `
  fragment DevHubPptBoardIssueFields on Issue {
    ...DevHubIssueFields
    project { id name startDate targetDate progress health }
    team { id name key }
    children(first: 100) { nodes { id } }
  }
`;

export const DEVHUB_LEADERBOARD_PPT_ISSUES_QUERY = `
  query DevHubLeaderboardPptIssues {
    issues(
      first: 100
      filter: {
        labels: { name: { eq: "PPT" } }
        assignee: { null: false }
      }
    ) {
      nodes { ...DevHubIssueFields }
    }
  }
  ${DEVHUB_ISSUE_FIELDS}
`;

export const DEVHUB_ASSIGNED_ACTIVE_ISSUES_QUERY = `
  query DevHubAssignedActiveIssues($linearId: ID!) {
    issues(
      first: 50
      filter: {
        assignee: { id: { eq: $linearId } }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      nodes { ...DevHubIssueFields }
    }
  }
  ${DEVHUB_ISSUE_FIELDS}
`;

export const DEVHUB_SUGGESTED_PPTS_QUERY = `
  query DevHubSuggestedPpts {
    issues(
      first: 10
      filter: {
        assignee: { null: true }
        state: { type: { in: ["backlog", "unstarted"] } }
        labels: { name: { eq: "PPT" } }
      }
    ) {
      nodes { ...DevHubIssueFields }
    }
  }
  ${DEVHUB_ISSUE_FIELDS}
`;

export const DEVHUB_PPT_BOARD_ISSUES_QUERY = `
  query DevHubPptBoardIssues {
    issues(
      first: 100
      filter: {
        state: { type: { in: ["backlog", "unstarted", "started"] } }
        labels: { name: { eq: "PPT" } }
      }
    ) {
      nodes { ...DevHubPptBoardIssueFields }
    }
  }
  ${DEVHUB_ISSUE_FIELDS}
  ${DEVHUB_PPT_BOARD_ISSUE_FIELDS}
`;

export const DEVHUB_ISSUES_BY_IDS_QUERY = `
  query DevHubIssuesByIds($ids: [ID!]!, $first: Int!) {
    issues(first: $first, filter: { id: { in: $ids } }) {
      nodes { ...DevHubIssueFields }
    }
  }
  ${DEVHUB_ISSUE_FIELDS}
`;

export const DEVHUB_TEAM_WORKFLOW_STATES_QUERY = `
  query DevHubTeamWorkflowStates($teamId: String!) {
    team(id: $teamId) {
      states(first: 50) {
        nodes { id name type }
      }
    }
  }
`;

export const DEVHUB_PPT_ASSIGNMENT_WATCH_ISSUES_QUERY = `
  query DevHubPptAssignmentWatchIssues {
    issues(
      first: 100
      filter: {
        labels: { name: { eq: "PPT" } }
        assignee: { null: false }
        state: { type: { in: ["backlog", "unstarted", "started"] } }
      }
    ) {
      nodes {
        id
        identifier
        title
        url
        description
        estimate
        createdAt
        updatedAt
        state { type name }
        assignee { id email name displayName }
        labels(first: 50) { nodes { name } }
        comments(first: 50) { nodes { id body user { id } createdAt updatedAt editedAt } }
        history(first: 100) {
          nodes {
            actorId
            toAssigneeId
            fromAssigneeId
            toStateId
            fromStateId
            createdAt
          }
        }
      }
    }
  }
`;

export const LINEAR_GRAPHQL_DOCUMENTS = [
  {
    name: "DevHubLeaderboardPptIssues",
    document: DEVHUB_LEADERBOARD_PPT_ISSUES_QUERY,
  },
  {
    name: "DevHubAssignedActiveIssues",
    document: DEVHUB_ASSIGNED_ACTIVE_ISSUES_QUERY,
  },
  { name: "DevHubSuggestedPpts", document: DEVHUB_SUGGESTED_PPTS_QUERY },
  { name: "DevHubPptBoardIssues", document: DEVHUB_PPT_BOARD_ISSUES_QUERY },
  { name: "DevHubIssuesByIds", document: DEVHUB_ISSUES_BY_IDS_QUERY },
  {
    name: "DevHubTeamWorkflowStates",
    document: DEVHUB_TEAM_WORKFLOW_STATES_QUERY,
  },
  {
    name: "DevHubPptAssignmentWatchIssues",
    document: DEVHUB_PPT_ASSIGNMENT_WATCH_ISSUES_QUERY,
  },
] as const;
