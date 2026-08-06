import type { Prisma } from "@prisma/client";
import {
  ASSISTANT_TOOLS,
  assistantToolByName,
} from "@/lib/assistant-tool-definitions";
import { hasAdminAccess } from "@/lib/authz";
import { withLinearFallback } from "@/lib/linear";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import prisma from "@/lib/prisma";

export type AssistantToolContext = {
  userId: string;
  conversationId: string;
  messageId: string;
  toolCallId: string;
};

export { ASSISTANT_TOOLS, assistantToolByName };

function safeIssue(issue: {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  estimate: number | null;
  stateType: string;
  stateName: string;
  labelNames: string[];
}) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description,
    estimate: issue.estimate,
    stateType: issue.stateType,
    stateName: issue.stateName,
    labelNames: issue.labelNames,
  };
}

type HelpTopic =
  | "ppt"
  | "task_ideas"
  | "claims"
  | "proof"
  | "bonuses"
  | "payments"
  | "notifications"
  | "navigation";

const HELP: Record<HelpTopic, unknown> = {
  ppt: {
    title: "Paid per task (PPT)",
    body: "PPTs are guaranteed-rate tasks approved through DevHub. New or existing issues become PPTs only after an admin reviews a PPT request.",
    href: "/dashboard/ppts",
  },
  task_ideas: {
    title: "Task ideas",
    body: "Ideas can become ordinary Linear issues or reviewed PPT requests. Ordinary issues have no guaranteed payment and may only become bonus candidates after eligible work is completed.",
    href: "/dashboard/ppts/ideas",
  },
  claims: {
    title: "Claims and releases",
    body: "Claiming assigns an open PPT to you and starts its activity watch. Releasing returns your assignment to the board. Taking another person's task requires a reason in the existing board UI.",
    href: "/dashboard/ppts",
  },
  proof: {
    title: "Progress and proof",
    body: "Progress keeps an active assignment current. Completion proof must satisfy the one shared DevHub proof rule before payout evaluation can release it.",
    href: "/dashboard/ppts",
  },
  bonuses: {
    title: "Bonuses",
    body: "Bonuses are discretionary monthly awards for eligible non-PPT work. PPT and bonus payment paths are mutually exclusive.",
    href: "/dashboard/bonuses",
  },
  payments: {
    title: "Payments",
    body: "The assistant can explain payment rules but cannot read private payout details or perform payout actions.",
    href: "/dashboard/transactions",
  },
  notifications: {
    title: "Notifications",
    body: "Configurable notification channels live under HR Settings. Money and compliance updates are always sent.",
    href: "/dashboard/settings",
  },
  navigation: {
    title: "DevHub navigation",
    body: "PPT Board manages paid tasks; Bonuses shows bonus candidates; Transactions shows payout history; HR Settings manages profile, linked accounts and notification preferences; Help contains the full earning guide.",
    href: "/dashboard/help",
  },
};

function actionPreview(name: string, payload: Record<string, unknown>) {
  const title = String(payload.title ?? payload.issueId ?? "task");
  const previews: Record<
    string,
    { title: string; description: string; warning?: string }
  > = {
    propose_create_task: {
      title: `Create ordinary Linear issue: ${title}`,
      description: "Creates an unlabelled Linear issue in the selected team.",
      warning: "This is not a PPT and does not guarantee payment.",
    },
    propose_update_task: {
      title: `Update task ${title}`,
      description: "Updates only the safe fields shown in this card.",
    },
    propose_comment: {
      title: `Comment on ${title}`,
      description: "Posts the shown text to Linear.",
    },
    propose_claim_task: {
      title: `Claim ${title}`,
      description:
        "Assigns this open PPT to you and starts its activity watch.",
    },
    propose_release_task: {
      title: `Release ${title}`,
      description: "Unassigns you and returns the PPT to the board.",
    },
    propose_block_task: {
      title: `Mark ${title} blocked`,
      description: "Pauses the watched assignment using the selected reason.",
    },
    propose_progress: {
      title: `Post progress on ${title}`,
      description:
        "Posts the update and refreshes the assignment activity timer.",
    },
    propose_proof: {
      title: `Post proof on ${title}`,
      description:
        "Validates and posts completion proof for payout evaluation.",
    },
    propose_ppt_request: {
      title: `Submit PPT request: ${String(payload.title ?? "task")}`,
      description:
        "Submits this task for admin review using the shown scope, estimate and due date.",
      warning: "Approval is not automatic and attachments are not included.",
    },
    propose_assign_task: {
      title: `Change assignment for ${title}`,
      description:
        "Admins only: changes the assignee after current state is rechecked.",
    },
    propose_task_suggestion: {
      title: `Send task suggestion for ${title}`,
      description:
        "Admins only: creates the suggestion and sends its configured notifications.",
    },
  };
  return (
    previews[name] ?? {
      title: "Confirm action",
      description: "Review before continuing.",
    }
  );
}

async function createProposedAction(
  name: string,
  payload: Record<string, unknown>,
  context: AssistantToolContext,
) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: context.userId },
    select: { role: true, developerRank: true },
  });
  if (
    (name === "propose_assign_task" || name === "propose_task_suggestion") &&
    !hasAdminAccess(profile)
  ) {
    return { error: "This action requires admin access." };
  }

  const preview = actionPreview(name, payload);
  const idempotencyKey = `assistant:${context.conversationId}:${context.toolCallId}`;
  const existing = await prisma.assistantAction.findUnique({
    where: { idempotencyKey },
    select: { id: true, preview: true, expiresAt: true },
  });
  if (existing) {
    return {
      confirmationRequired: true,
      actionId: existing.id,
      preview: existing.preview,
      expiresAt: existing.expiresAt.toISOString(),
    };
  }
  const action = await prisma.assistantAction.create({
    data: {
      conversationId: context.conversationId,
      messageId: context.messageId,
      userId: context.userId,
      kind: name.replace(/^propose_/, ""),
      payload: payload as Prisma.InputJsonValue,
      preview,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      idempotencyKey,
    },
    select: { id: true, preview: true, expiresAt: true },
  });
  return {
    confirmationRequired: true,
    actionId: action.id,
    preview: action.preview,
    expiresAt: action.expiresAt.toISOString(),
  };
}

async function executeReadTool(
  name: string,
  payload: Record<string, unknown>,
  context: AssistantToolContext,
) {
  if (name === "get_devhub_help") {
    return HELP[payload.topic as HelpTopic];
  }
  if (name === "list_my_ppt_requests") {
    return prisma.pptRequest.findMany({
      where: { requesterId: context.userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        linearIssueIdentifier: true,
        linearIssueTitle: true,
        requestedEstimate: true,
        projectedDueDate: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
    });
  }
  if (name === "get_task") {
    return withLinearFallback(context.userId, async (client) => {
      const [issue] = await fetchIssuesByIds(client, [String(payload.issueId)]);
      return issue ? safeIssue(issue) : { error: "Task not found." };
    });
  }
  if (name === "list_open_ppts") {
    const issues = await getSuggestedPptsForUser(context.userId);
    return issues
      .filter((issue) => !issue.assignee)
      .slice(0, 20)
      .map(safeIssue);
  }
  if (name === "list_teams") {
    return withLinearFallback(context.userId, async (client) => {
      const teams = await client.teams();
      return teams.nodes.map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
      }));
    });
  }
  if (name === "list_projects") {
    return withLinearFallback(context.userId, async (client) => {
      const team = await client.team(String(payload.teamId));
      const projects = await team.projects();
      return projects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
      }));
    });
  }
  if (name === "list_my_tasks") {
    const profile = await prisma.userProfile.findUnique({
      where: { id: context.userId },
      select: { linearId: true },
    });
    if (!profile?.linearId) return { error: "Linear is not linked." };
    return withLinearFallback(context.userId, async (client) => {
      const response = await client.issues({
        first: 50,
        filter: {
          assignee: { id: { eq: profile.linearId } },
          state: { type: { nin: ["completed", "canceled"] } },
        },
      });
      const ids = response.nodes.map((issue) => issue.id);
      return (await fetchIssuesByIds(client, ids)).map(safeIssue);
    });
  }
  if (name === "search_tasks") {
    return withLinearFallback(context.userId, async (client) => {
      const response = await client.searchIssues(String(payload.query), {
        first: 10,
      });
      const ids = response.nodes.map((issue) => issue.id);
      return (await fetchIssuesByIds(client, ids)).map(safeIssue);
    });
  }
  return { error: "Unknown read tool." };
}

export async function executeAssistantTool(
  name: string,
  input: unknown,
  context: AssistantToolContext,
) {
  const tool = assistantToolByName(name);
  if (!tool) return { error: "Unknown tool." };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid tool input." };
  const payload = parsed.data as Record<string, unknown>;
  if (tool.mutation) return createProposedAction(name, payload, context);
  return executeReadTool(name, payload, context);
}
