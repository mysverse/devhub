/**
 * Mock Linear SDK client for dev mode.
 * Provides enough of the LinearClient interface to satisfy
 * all dashboard pages without making real API calls.
 */

// biome-ignore lint/suspicious/noExplicitAny: mock objects need flexible typing
type AnyObj = Record<string, any>;

const MOCK_VIEWER = {
  id: "dev-linear-001",
  name: "Alex Developer",
  displayName: "Alex Developer",
  email: "alex@mysverse.dev",
  avatarUrl: null,
};

function createMockIssue(overrides: AnyObj = {}): AnyObj {
  const defaults: AnyObj = {
    id: `issue-${Math.random().toString(36).slice(2, 8)}`,
    identifier: "MYS-100",
    title: "Mock Linear Issue",
    description: "A mock issue for dev mode testing.",
    url: "https://linear.app/mock/issue/MYS-100",
    estimate: 2,
    get assignee() {
      return Promise.resolve({
        id: "dev-linear-001",
        name: "Alex Developer",
        displayName: "Alex Developer",
        avatarUrl: null,
      });
    },
    get state() {
      return Promise.resolve({ type: "started", name: "In Progress" });
    },
    get labels() {
      return () =>
        Promise.resolve({
          nodes: [{ name: "PPT" }],
        });
    },
    get team() {
      return Promise.resolve({ key: "MYS", name: "MYSverse" });
    },
    get project() {
      return Promise.resolve({
        id: "project-001",
        name: "Core Platform",
        startDate: "2025-03-01",
        targetDate: "2025-08-01",
        progress: 0.45,
        health: "onTrack",
      });
    },
    children: () => Promise.resolve({ nodes: [] }),
  };
  return { ...defaults, ...overrides };
}

const MOCK_ISSUES = [
  createMockIssue({
    id: "issue-001",
    identifier: "MYS-201",
    title: "Implement real-time notifications",
    estimate: 3,
    get state() {
      return Promise.resolve({ type: "started", name: "In Progress" });
    },
    get assignee() {
      return Promise.resolve(null);
    },
  }),
  createMockIssue({
    id: "issue-002",
    identifier: "MYS-202",
    title: "Add dark mode toggle to settings",
    estimate: 1,
    get state() {
      return Promise.resolve({ type: "unstarted", name: "Todo" });
    },
    get assignee() {
      return Promise.resolve(null);
    },
  }),
  createMockIssue({
    id: "issue-003",
    identifier: "MYS-203",
    title: "Refactor payment processing module",
    estimate: 5,
    get state() {
      return Promise.resolve({ type: "started", name: "In Progress" });
    },
    get assignee() {
      return Promise.resolve({
        id: "dev-linear-001",
        name: "Alex Developer",
        displayName: "Alex Developer",
        avatarUrl: null,
      });
    },
  }),
  createMockIssue({
    id: "issue-004",
    identifier: "MYS-204",
    title: "Build analytics dashboard widgets",
    estimate: 3,
    get state() {
      return Promise.resolve({ type: "started", name: "In Progress" });
    },
    get assignee() {
      return Promise.resolve({
        id: "dev-linear-002",
        name: "Bella Chen",
        displayName: "Bella Chen",
        avatarUrl: null,
      });
    },
  }),
  createMockIssue({
    id: "issue-005",
    identifier: "MYS-205",
    title: "Improve API error handling",
    estimate: 2,
    get state() {
      return Promise.resolve({ type: "completed", name: "Done" });
    },
    get assignee() {
      return Promise.resolve({
        id: "dev-linear-001",
        name: "Alex Developer",
        displayName: "Alex Developer",
        avatarUrl: null,
      });
    },
  }),
  createMockIssue({
    id: "issue-006",
    identifier: "MYS-206",
    title: "Optimize database queries",
    estimate: 4,
    get state() {
      return Promise.resolve({ type: "completed", name: "Done" });
    },
    get assignee() {
      return Promise.resolve({
        id: "dev-linear-003",
        name: "Carlos Rivera",
        displayName: "Carlos Rivera",
        avatarUrl: null,
      });
    },
  }),
];

/** A mock LinearClient that satisfies the SDK interface used in this app. */
export function createMockLinearClient(): AnyObj {
  return {
    get viewer() {
      return Promise.resolve(MOCK_VIEWER);
    },
    issues: (_filter?: AnyObj) => {
      return Promise.resolve({
        nodes: MOCK_ISSUES,
      });
    },
    issue: (id: string) => {
      const found = MOCK_ISSUES.find((i) => i.id === id);
      return Promise.resolve(
        found ??
          createMockIssue({
            id,
            identifier: "MYS-???",
            title: "Unknown Issue",
          }),
      );
    },
    updateIssue: (_id: string, _data: AnyObj) => {
      return Promise.resolve({ success: true });
    },
  };
}
