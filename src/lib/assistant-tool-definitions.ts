import * as z from "zod/v4";

export type AssistantToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodType;
  mutation: boolean;
};

const SearchTasksSchema = z.object({
  query: z.string().trim().min(1).max(160),
});
const EmptySchema = z.object({});
const TeamSchema = z.object({ teamId: z.string().min(1) });
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
  linearIssueIdentifier: z.string().nullable(),
  linearIssueUrl: z.string().url().nullable(),
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
    name: "search_tasks",
    description:
      "Search Linear by issue title or identifier. Use before referring to a task the user has not identified with an exact current ID.",
    schema: SearchTasksSchema,
    mutation: false,
  },
  {
    name: "list_my_tasks",
    description: "List the signed-in user's active Linear assignments.",
    schema: EmptySchema,
    mutation: false,
  },
  {
    name: "list_open_ppts",
    description: "List open paid PPT tasks the signed-in user could claim.",
    schema: EmptySchema,
    mutation: false,
  },
  {
    name: "list_my_ppt_requests",
    description: "List the signed-in user's recent PPT requests and statuses.",
    schema: EmptySchema,
    mutation: false,
  },
  {
    name: "list_teams",
    description:
      "List Linear teams available to the signed-in user. Use before preparing a new issue when no exact team ID is known.",
    schema: EmptySchema,
    mutation: false,
  },
  {
    name: "list_projects",
    description:
      "List Linear projects for an exact team ID. Use before preparing a new issue when project selection is relevant.",
    schema: TeamSchema,
    mutation: false,
  },
  {
    name: "get_devhub_help",
    description:
      "Retrieve authoritative DevHub guidance and navigation for a topic. Use this instead of guessing product rules.",
    schema: HelpSchema,
    mutation: false,
  },
  {
    name: "propose_create_task",
    description:
      "Propose creating an ordinary, non-PPT Linear issue. This never guarantees payment and always requires user confirmation.",
    schema: CreateTaskSchema,
    mutation: true,
  },
  {
    name: "propose_update_task",
    description:
      "Propose editing safe fields on an authorized non-PPT issue. Labels, estimate and workflow state are intentionally unavailable.",
    schema: UpdateTaskSchema,
    mutation: true,
  },
  {
    name: "propose_comment",
    description: "Propose adding a normal Linear comment after confirmation.",
    schema: IssueBodySchema,
    mutation: true,
  },
  {
    name: "propose_claim_task",
    description: "Propose claiming an open PPT for the signed-in user.",
    schema: IssueOnlySchema,
    mutation: true,
  },
  {
    name: "propose_release_task",
    description:
      "Propose releasing the signed-in user's current PPT assignment.",
    schema: IssueOnlySchema,
    mutation: true,
  },
  {
    name: "propose_block_task",
    description: "Propose marking the signed-in user's current PPT as blocked.",
    schema: BlockSchema,
    mutation: true,
  },
  {
    name: "propose_progress",
    description:
      "Propose posting a meaningful progress update through DevHub's watched-assignment flow.",
    schema: IssueBodySchema,
    mutation: true,
  },
  {
    name: "propose_proof",
    description:
      "Propose posting completion proof through DevHub's shared proof validator.",
    schema: IssueBodySchema,
    mutation: true,
  },
  {
    name: "propose_ppt_request",
    description:
      "Propose a reviewed DevHub PPT request. The due date must come from the user; attachments require the existing form.",
    schema: PptRequestSchema,
    mutation: true,
  },
  {
    name: "propose_assign_task",
    description:
      "Admins only: propose assigning or unassigning an ordinary non-PPT issue.",
    schema: AssignSchema,
    mutation: true,
  },
  {
    name: "propose_task_suggestion",
    description:
      "Admins only: propose sending a specific open PPT suggestion to a developer.",
    schema: SuggestSchema,
    mutation: true,
  },
];

export function assistantToolByName(name: string) {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name) ?? null;
}
