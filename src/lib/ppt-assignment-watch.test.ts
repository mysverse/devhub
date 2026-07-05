import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveAssignmentActivity } from "./ppt-assignment-watch-activity";

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
