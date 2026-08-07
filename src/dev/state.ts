/**
 * In-memory state for the dev-mode mock service handlers. Anchored on
 * globalThis so Turbopack module re-evaluation (HMR) doesn't wipe it
 * mid-session. Resets on server restart — which returns everything to the
 * seeded baseline, since the DB seed and these fixtures share one source of
 * truth (src/dev/fixtures/*).
 */

import {
  type DevLinearStateType,
  daysAgo,
  issueUrl,
  LINEAR_ISSUES,
  LINEAR_LABELS,
  LINEAR_STATES,
  LINEAR_TEAM,
} from "@/dev/fixtures/linear";

export type MockLinearComment = {
  id: string;
  body: string;
  userId: string;
  createdAt: Date;
};

export type MockLinearIssue = {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string | null;
  estimate: number | null;
  stateId: string;
  assigneeId: string | null;
  labelNames: string[];
  teamId: string;
  projectId: string | null;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
  trashed: boolean;
  dueDate?: string | null;
  comments: MockLinearComment[];
};

export type MockLinearLabel = { id: string; name: string; color: string };

export type MockPaymentOrder = {
  id: string;
  status: string;
  /** Flips processing → completed on the second status read. */
  reads: number;
  payload: Record<string, unknown>;
};

export type DevState = {
  linear: {
    issues: Map<string, MockLinearIssue>;
    labels: MockLinearLabel[];
    nextIssueNumber: number;
    nextCommentNumber: number;
  };
  upstash: Map<string, { value: string; expiresAt: number | null }>;
  billplz: Map<string, MockPaymentOrder>;
  xendit: Map<string, MockPaymentOrder>;
  /** Discord guild member roles: userId → role ids. */
  discordRoles: Map<string, Set<string>>;
  blobs: Map<string, { contentType: string; bytes: Uint8Array }>;
  counters: {
    email: number;
    finsys: number;
    billplz: number;
    xendit: number;
    discordMessage: number;
    llm: number;
  };
};

export function stateForType(type: DevLinearStateType) {
  return LINEAR_STATES[type];
}

export function stateById(stateId: string) {
  const state = Object.values(LINEAR_STATES).find((s) => s.id === stateId);
  if (!state) {
    throw new Error(`[dev-mode] Unknown Linear workflow state id "${stateId}"`);
  }
  return state;
}

function buildLinearIssues(): Map<string, MockLinearIssue> {
  const issues = new Map<string, MockLinearIssue>();
  for (const fixture of LINEAR_ISSUES) {
    issues.set(fixture.id, {
      id: fixture.id,
      identifier: fixture.identifier,
      number: Number(fixture.identifier.split("-")[1]),
      title: fixture.title,
      description: fixture.description,
      estimate: fixture.estimate,
      stateId: LINEAR_STATES[fixture.stateType].id,
      assigneeId: fixture.assigneeId,
      labelNames: [...fixture.labelNames],
      // Was hardcoded, so every scoped query looked like one team.
      teamId: fixture.teamId ?? LINEAR_TEAM.id,
      projectId: fixture.projectId,
      url: issueUrl(fixture),
      createdAt: daysAgo(fixture.createdDaysAgo),
      updatedAt: daysAgo(
        fixture.completedDaysAgo ?? fixture.canceledDaysAgo ?? 1,
      ),
      completedAt:
        fixture.completedDaysAgo != null
          ? daysAgo(fixture.completedDaysAgo)
          : null,
      canceledAt:
        fixture.canceledDaysAgo != null
          ? daysAgo(fixture.canceledDaysAgo)
          : null,
      archivedAt: null,
      trashed: false,
      comments: (fixture.comments ?? []).map((comment) => ({
        id: comment.id,
        body: comment.body,
        userId: comment.userId,
        createdAt: daysAgo(comment.createdDaysAgo),
      })),
    });
  }
  return issues;
}

function createDevState(): DevState {
  return {
    linear: {
      issues: buildLinearIssues(),
      labels: Object.values(LINEAR_LABELS).map((label) => ({ ...label })),
      nextIssueNumber: 500,
      nextCommentNumber: 1,
    },
    upstash: new Map(),
    billplz: new Map(),
    xendit: new Map(),
    discordRoles: new Map(),
    blobs: new Map(),
    counters: {
      email: 0,
      finsys: 0,
      billplz: 0,
      xendit: 0,
      discordMessage: 0,
      llm: 0,
    },
  };
}

const STATE_KEY = Symbol.for("devhub.dev-state");

export function getDevState(): DevState {
  const g = globalThis as Record<PropertyKey, unknown>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = createDevState();
  }
  return g[STATE_KEY] as DevState;
}

export function resetDevState(): void {
  const g = globalThis as Record<PropertyKey, unknown>;
  g[STATE_KEY] = createDevState();
}
