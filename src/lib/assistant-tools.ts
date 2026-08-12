import type { Prisma } from "@prisma/client";
import { buildAssistantPptPayoutPreview } from "@/lib/assistant-payout-preview";
import {
  ASSISTANT_TOOLS,
  assistantToolByName,
} from "@/lib/assistant-tool-definitions";
import type {
  AssistantPptPayoutPreview,
  AssistantPreview,
} from "@/lib/assistant-types";
import { hasAdminAccess } from "@/lib/authz";
import { formatAmount, getCurrencyForPaymentMethod } from "@/lib/currency";
import { withLinearFallback } from "@/lib/linear";
import { getSuggestedPptsForUser } from "@/lib/linear-data";
import { fetchIssuesByIds } from "@/lib/linear-queries";
import { understandSearchQuery } from "@/lib/llm-suggestions";
import { selectCampaignBadge } from "@/lib/payout-campaign";
import {
  getCampaignBadgeFor,
  getLiveCampaignRows,
  toSelectableCampaign,
} from "@/lib/payout-campaign-server";
import prisma from "@/lib/prisma";
import { explainTransaction } from "@/lib/transaction-explain";
import { getWikiArticleBySlug, searchWikiArticles } from "@/lib/wiki-search";

export type AssistantToolContext = {
  userId: string;
  conversationId: string;
  messageId: string;
  toolCallId: string;
};

export { ASSISTANT_TOOLS, assistantToolByName };

type AssistantIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  estimate: number | null;
  stateType: string;
  stateName: string;
  labelNames: string[];
};

function safeIssue(
  issue: AssistantIssue,
  payout: AssistantPptPayoutPreview | null = null,
) {
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
    payout,
  };
}

async function safeIssuesWithPayout(
  issues: AssistantIssue[],
  context: AssistantToolContext,
) {
  const hasPpt = issues.some((issue) =>
    issue.labelNames.some((label) => label.toLowerCase() === "ppt"),
  );
  if (!hasPpt) return issues.map((issue) => safeIssue(issue));

  const [profile, liveCampaignRows] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: context.userId },
      select: { developerRank: true, paymentMethod: true },
    }),
    getLiveCampaignRows(),
  ]);
  const currency = getCurrencyForPaymentMethod(profile?.paymentMethod ?? "MYR");
  const campaigns = liveCampaignRows.map(toSelectableCampaign);

  return issues.map((issue) => {
    const isPpt = issue.labelNames.some(
      (label) => label.toLowerCase() === "ppt",
    );
    if (!isPpt) return safeIssue(issue);
    const campaign = selectCampaignBadge(campaigns, {
      scope: "PPT",
      userId: context.userId,
      rank: profile?.developerRank ?? null,
      labels: issue.labelNames,
    });
    return safeIssue(
      issue,
      buildAssistantPptPayoutPreview(issue.estimate, currency, campaign),
    );
  });
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function destinationScore(query: string, name: string) {
  const normalizedQuery = normalizedWords(query).join(" ");
  const normalizedName = normalizedWords(name).join(" ");
  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (
    normalizedQuery.includes(normalizedName) ||
    normalizedName.includes(normalizedQuery)
  ) {
    return 70;
  }
  const queryWords = new Set(normalizedWords(query));
  return normalizedWords(name).reduce(
    (score, word) => score + (queryWords.has(word) ? 10 : 0),
    0,
  );
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

export function actionPreview(
  name: string,
  payload: Record<string, unknown>,
  payout?: AssistantPptPayoutPreview,
) {
  const title = String(payload.title ?? payload.issueId ?? "task");
  const previews: Record<string, AssistantPreview> = {
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
      ...(payout ? { payout } : {}),
    },
    propose_assign_task: {
      title: `Change assignment for ${title}`,
      description:
        "Admins only: changes the assignee after current state is rechecked.",
    },
    propose_create_bonus_task: {
      title: `Create bonus-path task: ${title}`,
      description:
        "Creates an unlabelled, candidate-ready issue assigned to you. Eligible for discretionary monthly bonus review.",
      warning:
        "Eventual monthly bonus payouts are discretionary and subject to admin review.",
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
    select: { role: true, developerRank: true, paymentMethod: true },
  });
  if (
    (name === "propose_assign_task" || name === "propose_task_suggestion") &&
    !hasAdminAccess(profile)
  ) {
    return { error: "This action requires admin access." };
  }

  let payout: AssistantPptPayoutPreview | undefined;
  if (name === "propose_ppt_request") {
    // A new request has no trustworthy issue labels yet. Strict campaign
    // matching therefore includes only campaigns that apply board-wide,
    // exactly like the standard PPT request flow.
    const campaign = await getCampaignBadgeFor({
      scope: "PPT",
      userId: context.userId,
      rank: profile?.developerRank ?? null,
    });
    const currency = getCurrencyForPaymentMethod(
      profile?.paymentMethod ?? "MYR",
    );
    payout = buildAssistantPptPayoutPreview(
      Number(payload.estimate),
      currency,
      campaign,
    );
  }

  const preview = actionPreview(name, payload, payout);
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
  if (name === "task_draft") {
    return { draft: payload };
  }
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
  if (name === "explain_my_transactions") {
    /**
     * DevHub narrates its own money, the model narrates DevHub.
     *
     * explainTransaction() is the single derivation the transactions page and
     * the overview list already share, so routing the assistant through it is
     * what stops a third version of the story existing. The model receives
     * finished sentences and pre-formatted amounts — it never re-derives a
     * rate, a multiplier or a status.
     */
    const rows = await prisma.transaction.findMany({
      where: { userId: context.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { payout: true, pptPayoutState: true },
    });

    return rows.map((row) => {
      const explanation = explainTransaction(row);
      return {
        identifier: row.linearIssueIdentifier,
        task: row.linearIssueTitle,
        source: row.source,
        status: row.status,
        amount: formatAmount(
          row.amount,
          row.currency === "ROBUX" ? "ROBUX" : "MYR",
        ),
        raisedOn: row.createdAt,
        paidOn: row.paidAt,
        why: explanation.headline,
        detail: explanation.detail,
        waitingOn: explanation.owner,
        campaignBreakdown: explanation.campaignBreakdown,
      };
    });
  }
  if (name === "get_task") {
    return withLinearFallback(context.userId, async (client) => {
      const [issue] = await fetchIssuesByIds(client, [String(payload.issueId)]);
      if (!issue) return { error: "Task not found." };
      return (await safeIssuesWithPayout([issue], context))[0];
    });
  }
  if (name === "list_open_ppts") {
    const issues = await getSuggestedPptsForUser(context.userId);
    const openIssues = issues.filter((issue) => !issue.assignee).slice(0, 20);
    return safeIssuesWithPayout(openIssues, context);
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
  if (name === "resolve_task_destination") {
    return withLinearFallback(context.userId, async (client) => {
      const query = String(payload.query);
      const teams = (await client.teams()).nodes;
      const destinations = (
        await Promise.all(
          teams.map(async (team) => {
            try {
              const projects = await team.projects({ first: 50 });
              return projects.nodes.map((project) => ({
                teamId: team.id,
                teamKey: team.key,
                teamName: team.name,
                projectId: project.id,
                projectName: project.name,
                score: destinationScore(query, project.name),
              }));
            } catch (error) {
              console.warn(
                `[assistant] could not list projects for team ${team.id}:`,
                error instanceof Error ? error.message : error,
              );
              return [];
            }
          }),
        )
      ).flat();
      const matches = destinations
        .filter((destination) => destination.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.projectName.localeCompare(right.projectName),
        )
        .slice(0, 8)
        .map(({ score: _score, ...destination }) => destination);
      return {
        query,
        matches,
        teams: teams.slice(0, 20).map((team) => ({
          id: team.id,
          key: team.key,
          name: team.name,
        })),
      };
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
      return safeIssuesWithPayout(await fetchIssuesByIds(client, ids), context);
    });
  }
  if (name === "search_game_wiki") {
    const query = String(payload.query || "");
    const game = payload.game ? String(payload.game) : null;

    /**
     * Widen the phrase before the deterministic scorer sees it.
     *
     * The scorer is bag-of-words, so "the thing buses drive on" scores nothing
     * against an article about roads. Understanding the phrase costs one small
     * call and changes only the terms; retrieval, ranking and snippets are
     * unchanged. Null — unconfigured, capped, refused — searches the raw
     * phrase, which is exactly what happened before this existed.
     */
    const intent = await understandSearchQuery(query, context.userId);
    const searchText = intent ? [query, ...intent.keywords].join(" ") : query;
    const results = await searchWikiArticles(searchText, {
      game,
      // Already an enum on the way out of the schema, so nothing to re-anchor.
      specialties: intent?.specialties,
      limit: 5,
    });
    return {
      query,
      game,
      results: results.map((res) => ({
        slug: res.article.slug,
        game: res.article.game,
        title: res.article.title,
        snippet: res.snippet.slice(0, 150),
        canonicalUrl: res.article.canonicalUrl,
      })),
    };
  }
  if (name === "get_game_wiki_article") {
    const slug = String(payload.slug || "");
    const article = await getWikiArticleBySlug(slug);
    if (!article) return { error: `Wiki article '${slug}' not found.` };
    return {
      slug: article.slug,
      game: article.game,
      title: article.title,
      description: article.description,
      canonicalUrl: article.canonicalUrl,
      sections: article.sections.map((sec) => ({
        heading: sec.heading,
        summary: sec.summary || sec.content.slice(0, 150),
      })),
    };
  }
  if (name === "search_tasks") {
    return withLinearFallback(context.userId, async (client) => {
      const response = await client.searchIssues(String(payload.query), {
        first: 10,
      });
      const ids = response.nodes.map((issue) => issue.id);
      return safeIssuesWithPayout(await fetchIssuesByIds(client, ids), context);
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
