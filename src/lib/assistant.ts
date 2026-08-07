import type { Prisma } from "@prisma/client";
import type {
  AssistantActionDto,
  AssistantConversationDto,
  AssistantConversationSummary,
  AssistantMessageDto,
  AssistantPptPayoutPreview,
  AssistantPreview,
  AssistantReferenceDto,
} from "@/lib/assistant-types";
import { hasAdminAccess } from "@/lib/authz";
import type { AssistantHistoryMessage } from "@/lib/llm-agent";
import prisma from "@/lib/prisma";

const MAX_MESSAGE_CHARS = 8_000;
const MAX_CONTEXT_MESSAGES = 24;
const DEFAULT_TURNS_PER_HOUR = 20;

type MessageWithActions = Prisma.AssistantMessageGetPayload<{
  include: { actions: true };
}>;

function preview(value: Prisma.JsonValue): AssistantPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      title: "Confirm action",
      description: "Review before continuing.",
    };
  }
  const row = value as Record<string, Prisma.JsonValue>;
  const payout = pptPayoutPreview(row.payout);
  return {
    title: typeof row.title === "string" ? row.title : "Confirm action",
    description:
      typeof row.description === "string"
        ? row.description
        : "Review before continuing.",
    ...(typeof row.warning === "string" ? { warning: row.warning } : {}),
    ...(payout ? { payout } : {}),
  };
}

function pptPayoutPreview(
  value: Prisma.JsonValue | undefined,
): AssistantPptPayoutPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Prisma.JsonValue>;
  if (
    (row.currency !== "MYR" && row.currency !== "ROBUX") ||
    typeof row.baseAmount !== "number" ||
    typeof row.amount !== "number" ||
    typeof row.baseLabel !== "string" ||
    typeof row.amountLabel !== "string" ||
    typeof row.multiplier !== "number"
  ) {
    return null;
  }
  const campaign = row.campaign;
  const parsedCampaign =
    campaign && typeof campaign === "object" && !Array.isArray(campaign)
      ? (campaign as Record<string, Prisma.JsonValue>)
      : null;
  const validCampaign =
    parsedCampaign &&
    typeof parsedCampaign.slug === "string" &&
    typeof parsedCampaign.name === "string" &&
    typeof parsedCampaign.multiplier === "number" &&
    typeof parsedCampaign.accentColor === "string" &&
    typeof parsedCampaign.endsAt === "string"
      ? {
          slug: parsedCampaign.slug,
          name: parsedCampaign.name,
          multiplier: parsedCampaign.multiplier,
          accentColor: parsedCampaign.accentColor,
          endsAt: parsedCampaign.endsAt,
        }
      : null;
  return {
    currency: row.currency,
    baseAmount: row.baseAmount,
    amount: row.amount,
    baseLabel: row.baseLabel,
    amountLabel: row.amountLabel,
    multiplier: row.multiplier,
    campaign: validCampaign,
  };
}

function messageReferences(
  value: Prisma.JsonValue | null,
): AssistantReferenceDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Prisma.JsonValue>;
    if (
      row.kind !== "linear_issue" ||
      typeof row.id !== "string" ||
      typeof row.identifier !== "string" ||
      typeof row.title !== "string" ||
      typeof row.url !== "string" ||
      typeof row.stateName !== "string"
    ) {
      return [];
    }
    return [
      {
        kind: "linear_issue" as const,
        id: row.id,
        identifier: row.identifier,
        title: row.title,
        url: row.url,
        description:
          typeof row.description === "string" ? row.description : null,
        estimate: typeof row.estimate === "number" ? row.estimate : null,
        stateName: row.stateName,
        labelNames: Array.isArray(row.labelNames)
          ? row.labelNames.filter(
              (label): label is string => typeof label === "string",
            )
          : [],
        imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
      },
    ];
  });
}

export function serializeAssistantAction(
  action: MessageWithActions["actions"][number],
): AssistantActionDto {
  return {
    id: action.id,
    kind: action.kind,
    payload: action.payload,
    preview: preview(action.preview),
    status: action.status,
    expiresAt: action.expiresAt.toISOString(),
    executedAt: action.executedAt?.toISOString() ?? null,
    result: action.result,
    error: action.error,
  };
}

export function serializeAssistantMessage(
  message: MessageWithActions,
): AssistantMessageDto {
  return {
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    content: message.content,
    status: message.status,
    provider: message.provider,
    model: message.model,
    createdAt: message.createdAt.toISOString(),
    actions: message.actions.map(serializeAssistantAction),
    references: messageReferences(message.references),
  };
}

function serializeConversation(conversation: {
  id: string;
  title: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AssistantConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

async function expireActions(userId: string, conversationId?: string) {
  await prisma.assistantAction.updateMany({
    where: {
      userId,
      status: "PENDING",
      expiresAt: { lte: new Date() },
      ...(conversationId ? { conversationId } : {}),
    },
    data: { status: "EXPIRED" },
  });
}

export async function listAssistantConversations(
  userId: string,
  archived = false,
) {
  await expireActions(userId);
  const conversations = await prisma.assistantConversation.findMany({
    where: {
      userId,
      archivedAt: archived ? { not: null } : null,
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  return conversations.map(serializeConversation);
}

export async function createAssistantConversation(userId: string) {
  const conversation = await prisma.assistantConversation.create({
    data: { userId, title: "New conversation" },
  });
  return serializeConversation(conversation);
}

export async function getAssistantConversation(
  userId: string,
  conversationId: string,
): Promise<AssistantConversationDto | null> {
  await expireActions(userId, conversationId);
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 120,
        include: { actions: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!conversation) return null;
  return {
    ...serializeConversation(conversation),
    messages: conversation.messages.map(serializeAssistantMessage),
  };
}

export async function updateAssistantConversation(
  userId: string,
  conversationId: string,
  update: { title?: string; archived?: boolean },
) {
  const title = update.title?.trim();
  if (title !== undefined && (title.length < 1 || title.length > 80)) {
    throw new Error("Conversation titles must be between 1 and 80 characters.");
  }
  const result = await prisma.assistantConversation.updateMany({
    where: { id: conversationId, userId },
    data: {
      ...(title ? { title } : {}),
      ...(update.archived !== undefined
        ? { archivedAt: update.archived ? new Date() : null }
        : {}),
    },
  });
  return result.count === 1;
}

export async function deleteAssistantConversation(
  userId: string,
  conversationId: string,
) {
  const result = await prisma.assistantConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  return result.count === 1;
}

function turnLimit() {
  const parsed = Number.parseInt(
    process.env.LLM_ASSISTANT_MAX_TURNS_PER_HOUR ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_TURNS_PER_HOUR;
}

function titleFrom(message: string) {
  const firstLine = message.replace(/\s+/g, " ").trim();
  return firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57)}…`;
}

function redactPatterns(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[redacted number]")
    .replace(
      /\b(?:sk|api|token|secret|password)[-_ ]?[A-Za-z0-9_-]{12,}\b/gi,
      "[redacted secret]",
    );
}

export async function createAssistantRedactor(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      preferredName: true,
      legalName: true,
      shippingAddress: true,
      linearEmail: true,
      paypalEmail: true,
      duitNowId: true,
      bankAccountNumber: true,
      bankAccountName: true,
      user: { select: { name: true, email: true } },
    },
  });
  const exact = [
    profile?.legalName,
    profile?.shippingAddress,
    profile?.linearEmail,
    profile?.paypalEmail,
    profile?.duitNowId,
    profile?.bankAccountNumber,
    profile?.bankAccountName,
    profile?.user.name,
    profile?.user.email,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .sort((left, right) => right.length - left.length);

  return (text: string) => {
    let redacted = redactPatterns(text);
    for (const value of exact) {
      redacted = redacted.replaceAll(value, "[redacted personal data]");
    }
    return redacted;
  };
}

export async function prepareAssistantTurn(
  userId: string,
  conversationId: string,
  rawContent: string,
) {
  const content = rawContent.trim();
  if (!content || content.length > MAX_MESSAGE_CHARS) {
    throw new Error(
      `Messages must be between 1 and ${MAX_MESSAGE_CHARS} characters.`,
    );
  }

  const limit = turnLimit();
  if (limit > 0) {
    const count = await prisma.assistantMessage.count({
      where: {
        role: "USER",
        conversation: { userId },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (count >= limit) {
      throw new Error(
        "You've reached the assistant's hourly turn limit. Try again later.",
      );
    }
  }

  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId, archivedAt: null },
    select: {
      id: true,
      title: true,
      messages: {
        where: { status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        take: MAX_CONTEXT_MESSAGES,
        select: { role: true, content: true },
      },
      _count: { select: { messages: { where: { status: "PENDING" } } } },
    },
  });
  if (!conversation) throw new Error("Conversation not found.");
  if (conversation._count.messages > 0) {
    throw new Error("Please wait for the current reply to finish.");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true, developerRank: true },
  });
  const redact = await createAssistantRedactor(userId);
  const previous = conversation.messages.reverse().map((message) => ({
    role: message.role === "USER" ? "user" : "assistant",
    content: redact(message.content),
  })) satisfies AssistantHistoryMessage[];

  const created = await prisma.$transaction(async (tx) => {
    const userMessage = await tx.assistantMessage.create({
      data: {
        conversationId,
        role: "USER",
        content,
        status: "COMPLETE",
      },
      include: { actions: true },
    });
    const assistantMessage = await tx.assistantMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: "",
        status: "PENDING",
      },
      include: { actions: true },
    });
    await tx.assistantConversation.update({
      where: { id: conversationId },
      data: {
        ...(conversation.title === "New conversation"
          ? { title: titleFrom(content) }
          : {}),
        updatedAt: new Date(),
      },
    });
    return { userMessage, assistantMessage };
  });

  return {
    history: [...previous, { role: "user" as const, content: redact(content) }],
    isAdmin: hasAdminAccess(profile),
    redact,
    userMessage: serializeAssistantMessage(created.userMessage),
    assistantMessage: serializeAssistantMessage(created.assistantMessage),
  };
}

export async function finishAssistantMessage(input: {
  messageId: string;
  userId: string;
  content: string;
  status: "COMPLETE" | "INTERRUPTED" | "FAILED";
  provider?: string | null;
  model?: string | null;
  references?: AssistantReferenceDto[];
}) {
  const message = await prisma.assistantMessage.update({
    where: {
      id: input.messageId,
      conversation: { userId: input.userId },
    },
    data: {
      content: input.content,
      status: input.status,
      provider: input.provider,
      model: input.model,
      ...(input.references
        ? { references: input.references as Prisma.InputJsonValue }
        : {}),
      conversation: { update: { updatedAt: new Date() } },
    },
    include: { actions: { orderBy: { createdAt: "asc" } } },
  });
  return serializeAssistantMessage(message);
}

export async function getAssistantActionDto(userId: string, actionId: string) {
  const action = await prisma.assistantAction.findFirst({
    where: { id: actionId, userId },
  });
  if (!action) return null;
  return serializeAssistantAction(action);
}
