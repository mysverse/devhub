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

export type AssignmentWatchTimingInput = {
  lastActivityAt: Date;
  status?: string | null;
  snoozedUntil?: Date | null;
  selfBlockExpiresAt?: Date | null;
  now?: Date;
  warningHours: number;
  unassignHours: number;
};

export type AssignmentWatchTiming = {
  warningAt: Date;
  unassignAt: Date;
  staleHours: number;
  hoursUntilWarning: number;
  hoursUntilUnassign: number;
  isSnoozed: boolean;
  /** Developer marked themselves blocked; the stale clock is paused. */
  isBlocked: boolean;
  /** Snoozed or blocked — the stale clock is not running. */
  isPaused: boolean;
  dueWithin24Hours: boolean;
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

export function getAssignmentWatchTiming({
  lastActivityAt,
  status,
  snoozedUntil,
  selfBlockExpiresAt,
  now = new Date(),
  warningHours,
  unassignHours,
}: AssignmentWatchTimingInput): AssignmentWatchTiming {
  const warningAt = new Date(
    lastActivityAt.getTime() + warningHours * 60 * 60 * 1000,
  );
  const unassignAt = new Date(
    lastActivityAt.getTime() + unassignHours * 60 * 60 * 1000,
  );
  const staleHours =
    (now.getTime() - lastActivityAt.getTime()) / (60 * 60 * 1000);
  const hoursUntilWarning =
    (warningAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  const hoursUntilUnassign =
    (unassignAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  const isSnoozed =
    status === "SNOOZED" &&
    Boolean(snoozedUntil && snoozedUntil.getTime() > now.getTime());
  const isBlocked =
    status === "BLOCKED" &&
    Boolean(selfBlockExpiresAt && selfBlockExpiresAt.getTime() > now.getTime());
  const isPaused = isSnoozed || isBlocked;

  return {
    warningAt,
    unassignAt,
    staleHours,
    hoursUntilWarning,
    hoursUntilUnassign,
    isSnoozed,
    isBlocked,
    isPaused,
    dueWithin24Hours:
      !isPaused &&
      status !== "UNASSIGNED" &&
      status !== "RESOLVED" &&
      hoursUntilUnassign <= 24,
  };
}
