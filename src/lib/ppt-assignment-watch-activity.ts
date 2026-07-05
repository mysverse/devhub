const DEVHUB_COMMENT_MARKER = "<!-- devhub:ppt-assignment-watch -->";

export type AssignmentWatchActivityIssue = {
  title: string | null;
  description: string | null;
  estimate: number | null;
  updatedAt: Date | null;
  state: { type: string | null; name: string | null };
  assignee: { id: string };
  comments: {
    id?: string;
    body: string;
    userId: string | null;
    createdAt: Date;
    updatedAt: Date | null;
    editedAt: Date | null;
  }[];
};

export type AssignmentWatchSnapshot = {
  title: string | null;
  description: string | null;
  estimate: number | null;
  stateType: string | null;
  stateName: string | null;
  assigneeLinearId: string;
};

export type AssignmentActivityInput = {
  issue: AssignmentWatchActivityIssue;
  assignedAt: Date;
  previousLastActivityAt?: Date | null;
  previousSnapshot?: AssignmentWatchSnapshot | null;
};

export type AssignmentActivityResult = {
  lastActivityAt: Date;
  changed: boolean;
  snapshot: AssignmentWatchSnapshot;
};

export function isDevHubAssignmentWatchComment(body: string) {
  return body.includes(DEVHUB_COMMENT_MARKER);
}

function snapshotFor(
  issue: AssignmentActivityInput["issue"],
): AssignmentWatchSnapshot {
  return {
    title: issue.title,
    description: issue.description,
    estimate: issue.estimate,
    stateType: issue.state.type,
    stateName: issue.state.name,
    assigneeLinearId: issue.assignee.id,
  };
}

function sameSnapshot(
  left: AssignmentWatchSnapshot | null,
  right: AssignmentWatchSnapshot,
) {
  if (!left) return false;
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.estimate === right.estimate &&
    left.stateType === right.stateType &&
    left.stateName === right.stateName &&
    left.assigneeLinearId === right.assigneeLinearId
  );
}

export function deriveAssignmentActivity({
  issue,
  assignedAt,
  previousLastActivityAt,
  previousSnapshot,
}: AssignmentActivityInput): AssignmentActivityResult {
  const snapshot = snapshotFor(issue);
  let lastActivityAt = previousLastActivityAt ?? assignedAt;
  let changed = false;

  if (!sameSnapshot(previousSnapshot ?? null, snapshot)) {
    const changedAt = issue.updatedAt ?? new Date();
    if (changedAt > lastActivityAt) {
      lastActivityAt = changedAt;
      changed = true;
    }
  }

  for (const comment of issue.comments) {
    const commentAt =
      comment.editedAt ?? comment.updatedAt ?? comment.createdAt;
    if (
      commentAt > lastActivityAt &&
      commentAt >= assignedAt &&
      comment.userId &&
      !isDevHubAssignmentWatchComment(comment.body)
    ) {
      lastActivityAt = commentAt;
      changed = true;
    }
  }

  return { lastActivityAt, changed, snapshot };
}
