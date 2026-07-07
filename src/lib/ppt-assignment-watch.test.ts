import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveAssignmentActivity,
  getAssignmentWatchTiming,
} from "./ppt-assignment-watch-activity";
import {
  hasMeaningfulPptProgress,
  PPT_PROGRESS_TEMPLATE,
} from "./ppt-progress";

const assignedAt = new Date("2026-07-01T00:00:00.000Z");
const previousLastActivityAt = new Date("2026-07-01T01:00:00.000Z");

const baseIssue = {
  title: "Build transit shelter",
  description: "Initial scope",
  estimate: 3,
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  state: { type: "started", name: "In Progress" },
  assignee: {
    id: "linear-alex",
    email: "alex@example.com",
    name: "Alex Developer",
    displayName: "Alex",
  },
  comments: [],
};

const previousSnapshot = {
  title: baseIssue.title,
  description: baseIssue.description,
  estimate: baseIssue.estimate,
  stateType: baseIssue.state.type,
  stateName: baseIssue.state.name,
  assigneeLinearId: baseIssue.assignee.id,
};

test("unchanged assignment preserves previous activity", () => {
  const result = deriveAssignmentActivity({
    issue: baseIssue,
    assignedAt,
    previousLastActivityAt,
    previousSnapshot,
  });

  assert.equal(result.changed, false);
  assert.equal(
    result.lastActivityAt.toISOString(),
    previousLastActivityAt.toISOString(),
  );
});

test("scope changes reset activity to issue updatedAt", () => {
  const result = deriveAssignmentActivity({
    issue: {
      ...baseIssue,
      title: "Build larger transit shelter",
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    },
    assignedAt,
    previousLastActivityAt,
    previousSnapshot,
  });

  assert.equal(result.changed, true);
  assert.equal(result.lastActivityAt.toISOString(), "2026-07-02T00:00:00.000Z");
});

test("developer comments reset activity but DevHub watcher comments do not", () => {
  const result = deriveAssignmentActivity({
    issue: {
      ...baseIssue,
      comments: [
        {
          id: "comment-devhub",
          body: "<!-- devhub:ppt-assignment-watch --> warning",
          userId: "linear-admin",
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
          updatedAt: null,
          editedAt: null,
        },
        {
          id: "comment-user",
          body: "Progress update: finished shell modeling.",
          userId: "linear-alex",
          createdAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: null,
          editedAt: null,
        },
      ],
    },
    assignedAt,
    previousLastActivityAt,
    previousSnapshot,
  });

  assert.equal(result.changed, true);
  assert.equal(result.lastActivityAt.toISOString(), "2026-07-03T00:00:00.000Z");
});

test("assignment watch timing derives warning and unassign deadlines", () => {
  const timing = getAssignmentWatchTiming({
    lastActivityAt: new Date("2026-07-01T00:00:00.000Z"),
    now: new Date("2026-07-02T00:00:00.000Z"),
    warningHours: 48,
    unassignHours: 72,
  });

  assert.equal(timing.warningAt.toISOString(), "2026-07-03T00:00:00.000Z");
  assert.equal(timing.unassignAt.toISOString(), "2026-07-04T00:00:00.000Z");
  assert.equal(timing.staleHours, 24);
  assert.equal(timing.dueWithin24Hours, false);
});

test("snoozed watches are skipped until the snooze expires", () => {
  const timing = getAssignmentWatchTiming({
    status: "SNOOZED",
    lastActivityAt: new Date("2026-07-01T00:00:00.000Z"),
    snoozedUntil: new Date("2026-07-03T00:00:00.000Z"),
    now: new Date("2026-07-02T00:00:00.000Z"),
    warningHours: 48,
    unassignHours: 72,
  });

  assert.equal(timing.isSnoozed, true);
  assert.equal(timing.dueWithin24Hours, false);
});

test("expired snoozes resume normal stale timing", () => {
  const timing = getAssignmentWatchTiming({
    status: "SNOOZED",
    lastActivityAt: new Date("2026-07-01T00:00:00.000Z"),
    snoozedUntil: new Date("2026-07-02T00:00:00.000Z"),
    now: new Date("2026-07-03T00:00:00.000Z"),
    warningHours: 48,
    unassignHours: 72,
  });

  assert.equal(timing.isSnoozed, false);
  assert.equal(timing.dueWithin24Hours, true);
});

test("blank progress template is not meaningful assignment activity", () => {
  assert.equal(hasMeaningfulPptProgress(PPT_PROGRESS_TEMPLATE), false);
  assert.equal(
    hasMeaningfulPptProgress(
      `${PPT_PROGRESS_TEMPLATE}\nFinished signal wiring.`,
    ),
    true,
  );
});
