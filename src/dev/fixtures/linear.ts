/**
 * Canonical mock Linear workspace. Single source of truth shared by:
 *   - prisma/seed.ts (DB rows referencing Linear issues use these ids)
 *   - src/dev/handlers/linear.ts (GraphQL responses come from this data)
 *   - scripts/dev/simulate.ts (webhook payloads are built from these issues)
 *
 * Date fields are stored as day-offsets from "now" so seeded data always
 * lands in the current week/month; consumers convert with `daysAgo()`.
 */

import { BACKGROUND_USERS, PERSONAS } from "./personas";

export function daysAgo(days: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

export const LINEAR_ORG_URL = "https://linear.app/mysverse";

export const LINEAR_TEAM = {
  id: "team-mys",
  key: "MYS",
  name: "MYSverse",
};

export const LINEAR_PROJECT = {
  id: "project-sentinel",
  name: "Project Sentinel",
  startDaysAgo: 90,
  targetDaysAhead: 60,
  progress: 0.45,
  health: "onTrack",
};

export type DevLinearStateType =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

export const LINEAR_STATES: Record<
  DevLinearStateType,
  { id: string; name: string; type: DevLinearStateType; color: string }
> = {
  backlog: {
    id: "state-backlog",
    name: "Backlog",
    type: "backlog",
    color: "#bec2c8",
  },
  unstarted: {
    id: "state-todo",
    name: "Todo",
    type: "unstarted",
    color: "#e2e2e2",
  },
  started: {
    id: "state-progress",
    name: "In Progress",
    type: "started",
    color: "#f2c94c",
  },
  completed: {
    id: "state-done",
    name: "Done",
    type: "completed",
    color: "#5e6ad2",
  },
  canceled: {
    id: "state-canceled",
    name: "Canceled",
    type: "canceled",
    color: "#95a2b3",
  },
};

export const LINEAR_LABELS = {
  ppt: { id: "label-ppt", name: "PPT", color: "#26b5ce" },
  enhancement: {
    id: "label-enhancement",
    name: "Enhancement",
    color: "#4cb782",
  },
  bug: { id: "label-bug", name: "Bug", color: "#eb5757" },
};

export type DevLinearUser = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

export const LINEAR_USERS: DevLinearUser[] = [
  {
    id: PERSONAS.admin.linearId as string,
    name: PERSONAS.admin.name,
    displayName: "aina",
    email: PERSONAS.admin.email,
    avatarUrl: null,
  },
  {
    id: PERSONAS.developer.linearId as string,
    name: PERSONAS.developer.name,
    displayName: "alex",
    email: PERSONAS.developer.email,
    avatarUrl: null,
  },
  ...BACKGROUND_USERS.map((user) => ({
    id: user.linearId,
    name: user.name,
    displayName: user.name.split(" ")[0].toLowerCase(),
    email: user.email,
    avatarUrl: null,
  })),
];

export type DevLinearComment = {
  id: string;
  body: string;
  userId: string;
  createdDaysAgo: number;
};

export type DevLinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  estimate: number | null;
  stateType: DevLinearStateType;
  assigneeId: string | null;
  labelNames: string[];
  projectId: string | null;
  createdDaysAgo: number;
  /** Set when stateType is "completed". */
  completedDaysAgo?: number;
  /** Set when stateType is "canceled". */
  canceledDaysAgo?: number;
  comments?: DevLinearComment[];
};

export function issueUrl(issue: Pick<DevLinearIssue, "identifier">): string {
  return `${LINEAR_ORG_URL}/issue/${issue.identifier}`;
}

const ALEX = PERSONAS.developer.linearId as string;
const BALA = BACKGROUND_USERS[0].linearId;
const MEI = BACKGROUND_USERS[1].linearId;
const RAVI = BACKGROUND_USERS[2].linearId;

/** Long enough + "screenshot" + URL so isMeaningfulProof passes. */
export function proofCommentBody(identifier: string): string {
  return (
    `#ppt-proof Completed and verified in a private test session — ` +
    `screenshot of the final result attached: ` +
    `https://files.devhub.mock/proof/${identifier}.png. ` +
    `All acceptance criteria from the issue description are met.`
  );
}

export const LINEAR_ISSUES: DevLinearIssue[] = [
  // ── Active work assigned to the developer persona ─────────────────────────
  {
    id: "issue-mys-201",
    identifier: "MYS-201",
    title: "Implement convoy escort mission flow",
    description:
      "Build the convoy escort mission loop: spawn logic, checkpoints, and reward hand-off.",
    estimate: 3,
    stateType: "started",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 9,
  },
  {
    id: "issue-mys-202",
    identifier: "MYS-202",
    title: "Fix vehicle suspension jitter on bridges",
    description: "Suspension constraint oscillates when crossing bridge seams.",
    estimate: 2,
    stateType: "started",
    assigneeId: ALEX,
    labelNames: ["PPT", "Bug"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 6,
  },
  {
    id: "issue-mys-203",
    identifier: "MYS-203",
    title: "Polish dashboard onboarding empty states",
    description: "Bonus-track UI polish task (no PPT label).",
    estimate: 2,
    stateType: "started",
    assigneeId: ALEX,
    labelNames: ["Enhancement"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 4,
  },
  {
    id: "issue-mys-204",
    identifier: "MYS-204",
    title: "Refit traffic light controller for new junction kit",
    description: null,
    estimate: 1,
    stateType: "unstarted",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 3,
  },

  // ── Unassigned suggested PPTs ──────────────────────────────────────────────
  {
    id: "issue-mys-210",
    identifier: "MYS-210",
    title: "Build interior for the new fire station",
    description: "Full interior pass for the Bandar fire station shell.",
    estimate: 5,
    stateType: "unstarted",
    assigneeId: null,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 12,
  },
  {
    id: "issue-mys-211",
    identifier: "MYS-211",
    title: "Model modular highway barrier set",
    description: null,
    estimate: 3,
    stateType: "unstarted",
    assigneeId: null,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 10,
  },
  {
    id: "issue-mys-212",
    identifier: "MYS-212",
    title: "Build bus depot route signage pack",
    description: "Backlog PPT fixture used to verify DevHub board visibility.",
    estimate: 2,
    stateType: "backlog",
    assigneeId: null,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 8,
  },
  {
    id: "issue-mys-213",
    identifier: "MYS-213",
    title: "Script ticket gate for rapid transit entrances",
    description: null,
    estimate: 2,
    stateType: "unstarted",
    assigneeId: null,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 8,
  },
  {
    id: "issue-mys-214",
    identifier: "MYS-214",
    title: "Retexture legacy police liveries",
    description: null,
    estimate: 1,
    stateType: "unstarted",
    assigneeId: null,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 7,
  },

  // ── Completed by the developer persona ────────────────────────────────────
  {
    id: "issue-mys-220",
    identifier: "MYS-220",
    title: "Ship patrol radio overhaul",
    description: "Replace the legacy radio with the new comms framework.",
    estimate: 2,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 20,
    completedDaysAgo: 8,
    comments: [
      {
        id: "comment-mys-220-proof",
        body: proofCommentBody("MYS-220"),
        userId: ALEX,
        createdDaysAgo: 8,
      },
    ],
  },
  {
    id: "issue-mys-221",
    identifier: "MYS-221",
    title: "Add weapon holstering animations",
    description: null,
    estimate: 3,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 14,
    completedDaysAgo: 2,
    comments: [
      {
        id: "comment-mys-221-proof",
        body: proofCommentBody("MYS-221"),
        userId: ALEX,
        createdDaysAgo: 2,
      },
    ],
  },
  {
    id: "issue-mys-222",
    identifier: "MYS-222",
    title: "Tune ambient lighting for night cycle",
    description: "Completed but no proof comment yet (exercises NEEDS_PROOF).",
    estimate: 1,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 5,
    completedDaysAgo: 1,
  },
  {
    id: "issue-mys-227",
    identifier: "MYS-227",
    title: "Repaint ambulance fleet to new livery spec",
    description: "Paid out, then the issue was reopened (exercises FLAGGED).",
    estimate: 2,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 22,
    completedDaysAgo: 10,
    comments: [
      {
        id: "comment-mys-227-proof",
        body: proofCommentBody("MYS-227"),
        userId: ALEX,
        createdDaysAgo: 10,
      },
    ],
  },
  {
    id: "issue-mys-228",
    identifier: "MYS-228",
    title: "Calibrate train door timings at platforms",
    description: "Completed just now (exercises WAITING_STABILITY).",
    estimate: 1,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 2,
    completedDaysAgo: 0,
    comments: [
      {
        id: "comment-mys-228-proof",
        body: proofCommentBody("MYS-228"),
        userId: ALEX,
        createdDaysAgo: 0,
      },
    ],
  },
  {
    id: "issue-mys-229",
    identifier: "MYS-229",
    title: "Wire up harbour crane controls",
    description:
      "Auto-payout in flight via Billplz (target for `pnpm simulate billplz`).",
    estimate: 2,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 12,
    completedDaysAgo: 3,
    comments: [
      {
        id: "comment-mys-229-proof",
        body: proofCommentBody("MYS-229"),
        userId: ALEX,
        createdDaysAgo: 3,
      },
    ],
  },
  {
    id: "issue-mys-231",
    identifier: "MYS-231",
    title: "Rework spawn selection screen",
    description: "Bonus-track task completed this month.",
    estimate: 4,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["Enhancement"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 16,
    completedDaysAgo: 3,
  },
  {
    id: "issue-mys-232",
    identifier: "MYS-232",
    title: "Compose lobby ambience loops",
    description: "Bonus approved and queued for the monthly payout run.",
    estimate: 4,
    stateType: "completed",
    assigneeId: ALEX,
    labelNames: ["Enhancement"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 18,
    completedDaysAgo: 6,
  },
  {
    id: "issue-mys-233",
    identifier: "MYS-233",
    title: "Tidy asset naming conventions in workspace",
    description: null,
    estimate: 1,
    stateType: "completed",
    assigneeId: BALA,
    labelNames: ["Enhancement"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 14,
    completedDaysAgo: 9,
  },

  // ── Background developers (leaderboard + admin queues) ────────────────────
  {
    id: "issue-mys-223",
    identifier: "MYS-223",
    title: "Construct toll plaza for the east highway",
    description: null,
    estimate: 2,
    stateType: "completed",
    assigneeId: BALA,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 11,
    completedDaysAgo: 4,
    comments: [
      {
        id: "comment-mys-223-proof",
        body: proofCommentBody("MYS-223"),
        userId: BALA,
        createdDaysAgo: 4,
      },
    ],
  },
  {
    id: "issue-mys-224",
    identifier: "MYS-224",
    title: "Bake LOD meshes for stadium exterior",
    description: null,
    estimate: 3,
    stateType: "completed",
    assigneeId: MEI,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 13,
    completedDaysAgo: 5,
    comments: [
      {
        id: "comment-mys-224-proof",
        body: proofCommentBody("MYS-224"),
        userId: MEI,
        createdDaysAgo: 5,
      },
    ],
  },
  {
    id: "issue-mys-225",
    identifier: "MYS-225",
    title: "Assemble bus depot interior props",
    description: null,
    estimate: 2,
    stateType: "started",
    assigneeId: BALA,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 6,
  },
  {
    id: "issue-mys-226",
    identifier: "MYS-226",
    title: "Hook up elevator scripting in HQ tower",
    description: null,
    estimate: 1,
    stateType: "completed",
    assigneeId: RAVI,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 9,
    completedDaysAgo: 6,
    comments: [
      {
        id: "comment-mys-226-proof",
        body: proofCommentBody("MYS-226"),
        userId: RAVI,
        createdDaysAgo: 6,
      },
    ],
  },

  // ── Edge cases ─────────────────────────────────────────────────────────────
  {
    id: "issue-mys-230",
    identifier: "MYS-230",
    title: "Prototype drone camera system",
    description: "Canceled mid-flight (exercises BLOCKED/ISSUE_CANCELED).",
    estimate: 2,
    stateType: "canceled",
    assigneeId: ALEX,
    labelNames: ["PPT"],
    projectId: LINEAR_PROJECT.id,
    createdDaysAgo: 15,
    canceledDaysAgo: 7,
  },
];

export function getIssueByIdentifier(identifier: string): DevLinearIssue {
  const issue = LINEAR_ISSUES.find((i) => i.identifier === identifier);
  if (!issue) {
    throw new Error(
      `[dev-mode] No fixture Linear issue with identifier "${identifier}" in src/dev/fixtures/linear.ts`,
    );
  }
  return issue;
}

export function getLinearUser(id: string): DevLinearUser {
  const user = LINEAR_USERS.find((u) => u.id === id);
  if (!user) {
    throw new Error(
      `[dev-mode] No fixture Linear user with id "${id}" in src/dev/fixtures/linear.ts`,
    );
  }
  return user;
}
