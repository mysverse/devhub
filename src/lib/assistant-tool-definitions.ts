import * as z from "zod/v4";

export type AssistantToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodType;
  mutation: boolean;
  activity: { running: string; complete: string };
};

import { TASK_DRAFT_SCHEMA } from "@/lib/assistant-draft";

const CreateBonusTaskSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(8_000).nullable(),
  teamId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  dueDate: z.string().nullable(),
  estimate: z.number().int().min(1).max(5),
});

const SearchTasksSchema = z.object({
  query: z.string().trim().min(1).max(160),
});
const WikiSearchSchema = z.object({
  query: z.string().trim().min(1).max(160),
  game: z.enum(["all", "bandaraya", "lebuhraya", "sumaya", "faq"]).nullable(),
});
const WikiArticleSchema = z.object({
  slug: z.string().trim().min(1).max(160),
});
const EmptySchema = z.object({});
const TeamSchema = z.object({ teamId: z.string().min(1) });
const DestinationSchema = z.object({
  query: z.string().trim().min(1).max(160),
});
const HelpSchema = z.object({
  topic: z.enum([
    "ppt",
    "task_ideas",
    "claims",
    "proof",
    "bonuses",
    "payments",
    "notifications",
    "navigation",
  ]),
});
const CreateTaskSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(8_000).nullable(),
  teamId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  dueDate: z.string().nullable(),
});
const UpdateTaskSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().trim().min(3).max(120).nullable(),
  description: z.string().trim().max(8_000).nullable(),
  projectId: z.string().min(1).nullable(),
  dueDate: z.string().nullable(),
});
const IssueBodySchema = z.object({
  issueId: z.string().min(1),
  body: z.string().trim().min(1).max(8_000),
});
const IssueOnlySchema = z.object({ issueId: z.string().min(1) });
const BlockSchema = z.object({
  issueId: z.string().min(1),
  reason: z.enum([
    "WAITING_REVIEW",
    "WAITING_ASSETS",
    "WAITING_DEPENDENCY",
    "OTHER",
  ]),
  note: z.string().trim().max(500).nullable(),
});
const PptRequestSchema = z.object({
  mode: z.enum(["new", "existing"]),
  linearIssueId: z.string().min(1).nullable(),
  title: z.string().trim().min(3).max(120),
  teamId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  projectName: z.string().max(120).nullable(),
  description: z.string().trim().max(8_000).nullable(),
  note: z.string().trim().max(1_000).nullable(),
  estimate: z.number().int().min(1).max(5),
  dueDate: z.string(),
  assigneeIntent: z.enum(["SELF", "OPEN"]),
});
const AssignSchema = z.object({
  issueId: z.string().min(1),
  assigneeLinearId: z.string().min(1).nullable(),
});
const SuggestSchema = z.object({
  issueId: z.string().min(1),
  developerId: z.string().min(1),
  note: z.string().trim().max(500).nullable(),
});

export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: "search_game_wiki",
    description:
      "Search the MYSverse Wiki documentation across games (Bandaraya, Lebuhraya, Sumaya) for gameplay mechanics, emergency services, economy, jobs, rules, and housing before suggesting feature improvements or task ideas.",
    schema: WikiSearchSchema,
    mutation: false,
    activity: {
      running: "Searching game wiki",
      complete: "Game wiki search ready",
    },
  },
  {
    name: "get_game_wiki_article",
    description:
      "Read full details and sections of an exact game wiki article by slug (e.g. 'sumaya/jobs-fishing' or 'bandaraya/emergency-services').",
    schema: WikiArticleSchema,
    mutation: false,
    activity: {
      running: "Reading wiki article",
      complete: "Wiki article ready",
    },
  },
  {
    name: "search_tasks",
    description:
      "Search Linear by issue title or identifier. Use before referring to a task the user has not identified with an exact current ID.",
    schema: SearchTasksSchema,
    mutation: false,
    activity: { running: "Searching tasks", complete: "Task search ready" },
  },
  {
    name: "get_task",
    description:
      "Read current details for one exact Linear issue ID before explaining or proposing a change.",
    schema: IssueOnlySchema,
    mutation: false,
    activity: { running: "Opening the task", complete: "Task details ready" },
  },
  {
    name: "list_my_tasks",
    description: "List the signed-in user's active Linear assignments.",
    schema: EmptySchema,
    mutation: false,
    activity: {
      running: "Checking your active tasks",
      complete: "Active tasks ready",
    },
  },
  {
    name: "list_open_ppts",
    description: "List open paid PPT tasks the signed-in user could claim.",
    schema: EmptySchema,
    mutation: false,
    activity: { running: "Scanning open PPTs", complete: "Open PPTs ready" },
  },
  {
    name: "list_my_ppt_requests",
    description: "List the signed-in user's recent PPT requests and statuses.",
    schema: EmptySchema,
    mutation: false,
    activity: {
      running: "Checking your PPT requests",
      complete: "PPT requests ready",
    },
  },
  {
    name: "explain_my_transactions",
    description:
      "Explain the signed-in user's own recent payouts: the amount, the status, why it is in that state, and who it is waiting on. Use whenever they ask about money they are owed or have been paid.",
    schema: EmptySchema,
    mutation: false,
    activity: {
      running: "Reading your payouts",
      complete: "Payouts ready",
    },
  },
  {
    name: "list_teams",
    description:
      "List Linear teams available to the signed-in user. Use before preparing a new issue when no exact team ID is known.",
    schema: EmptySchema,
    mutation: false,
    activity: { running: "Loading Linear teams", complete: "Teams ready" },
  },
  {
    name: "list_projects",
    description:
      "List Linear projects for an exact team ID. Use before preparing a new issue when project selection is relevant.",
    schema: TeamSchema,
    mutation: false,
    activity: {
      running: "Loading team projects",
      complete: "Projects ready",
    },
  },
  {
    name: "resolve_task_destination",
    description:
      "Resolve a product or project name from a rough idea to exact Linear team/project IDs in one check. Prefer this over separately listing teams and projects when the user names where the work belongs.",
    schema: DestinationSchema,
    mutation: false,
    activity: {
      running: "Finding the right project",
      complete: "Project destination ready",
    },
  },
  {
    name: "get_devhub_help",
    description:
      "Retrieve authoritative DevHub guidance and navigation for a topic. Use this instead of guessing product rules.",
    schema: HelpSchema,
    mutation: false,
    activity: {
      running: "Checking DevHub guidance",
      complete: "Guidance ready",
    },
  },
  {
    name: "propose_create_task",
    description:
      "Propose creating an ordinary, non-PPT Linear issue. This never guarantees payment and always requires user confirmation.",
    schema: CreateTaskSchema,
    mutation: true,
    activity: {
      running: "Preparing a task for review",
      complete: "Task ready to review",
    },
  },
  {
    name: "propose_update_task",
    description:
      "Propose editing safe fields on an authorized non-PPT issue. Labels, estimate and workflow state are intentionally unavailable.",
    schema: UpdateTaskSchema,
    mutation: true,
    activity: {
      running: "Preparing the task update",
      complete: "Update ready to review",
    },
  },
  {
    name: "propose_comment",
    description: "Propose adding a normal Linear comment after confirmation.",
    schema: IssueBodySchema,
    mutation: true,
    activity: {
      running: "Preparing your comment",
      complete: "Comment ready to review",
    },
  },
  {
    name: "propose_claim_task",
    description: "Propose claiming an open PPT for the signed-in user.",
    schema: IssueOnlySchema,
    mutation: true,
    activity: {
      running: "Checking the task claim",
      complete: "Claim ready to review",
    },
  },
  {
    name: "propose_release_task",
    description:
      "Propose releasing the signed-in user's current PPT assignment.",
    schema: IssueOnlySchema,
    mutation: true,
    activity: {
      running: "Checking the task release",
      complete: "Release ready to review",
    },
  },
  {
    name: "propose_block_task",
    description: "Propose marking the signed-in user's current PPT as blocked.",
    schema: BlockSchema,
    mutation: true,
    activity: {
      running: "Preparing the blocked update",
      complete: "Blocked update ready",
    },
  },
  {
    name: "propose_progress",
    description:
      "Propose posting a meaningful progress update through DevHub's watched-assignment flow.",
    schema: IssueBodySchema,
    mutation: true,
    activity: {
      running: "Preparing your progress update",
      complete: "Progress ready to review",
    },
  },
  {
    name: "propose_proof",
    description:
      "Propose posting completion proof through DevHub's shared proof validator.",
    schema: IssueBodySchema,
    mutation: true,
    activity: {
      running: "Checking your proof",
      complete: "Proof ready to review",
    },
  },
  {
    name: "propose_ppt_request",
    description:
      "Propose a reviewed DevHub PPT request. The due date must come from the user; attachments require the existing form.",
    schema: PptRequestSchema,
    mutation: true,
    activity: {
      running: "Preparing the PPT request",
      complete: "PPT request ready to review",
    },
  },
  {
    name: "propose_assign_task",
    description:
      "Admins only: propose assigning or unassigning an ordinary non-PPT issue.",
    schema: AssignSchema,
    mutation: true,
    activity: {
      running: "Checking the assignment",
      complete: "Assignment ready to review",
    },
  },
  {
    name: "propose_task_suggestion",
    description:
      "Admins only: propose sending a specific open PPT suggestion to a developer.",
    schema: SuggestSchema,
    mutation: true,
    activity: {
      running: "Preparing the task suggestion",
      complete: "Suggestion ready to review",
    },
  },
  {
    name: "propose_create_bonus_task",
    description:
      "Propose creating an unlabelled, candidate-ready bonus-path task assigned to the signed-in developer. Work is eligible for discretionary monthly bonus review.",
    schema: CreateBonusTaskSchema,
    mutation: true,
    activity: {
      running: "Preparing bonus-path task",
      complete: "Bonus task ready to review",
    },
  },
  {
    name: "task_draft",
    description:
      "Present a validated structured task draft artifact to the user when the task route (PPT, Task, Bonus) is not explicitly requested.",
    schema: TASK_DRAFT_SCHEMA,
    mutation: false,
    activity: {
      running: "Preparing structured draft",
      complete: "Structured draft ready",
    },
  },
];

export function assistantToolByName(name: string) {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name) ?? null;
}
