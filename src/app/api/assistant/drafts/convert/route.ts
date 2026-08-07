import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { AssistantTaskDraftDto } from "@/lib/assistant-draft";
import { buildAssistantPptPayoutPreview } from "@/lib/assistant-payout-preview";
import { actionPreview } from "@/lib/assistant-tools";
import { getSession } from "@/lib/auth-utils";
import { getCurrencyForPaymentMethod } from "@/lib/currency";
import { getCampaignBadgeFor } from "@/lib/payout-campaign-server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      conversationId?: string;
      route?: "PPT" | "TASK" | "BONUS";
      draft?: AssistantTaskDraftDto;
    };

    const { conversationId, route, draft } = body;
    if (!conversationId || !route || !draft || typeof draft !== "object") {
      return NextResponse.json(
        { error: "Invalid convert payload." },
        { status: 400 },
      );
    }

    const conversation = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { developerRank: true, paymentMethod: true },
    });

    let actionKind = "create_task";
    let payload: Record<string, unknown> = {};

    if (route === "PPT") {
      actionKind = "ppt_request";
      payload = {
        mode: "new",
        linearIssueId: null,
        title: draft.title,
        teamId: draft.destination.teamId ?? "team-mysverse",
        projectId: draft.destination.projectId,
        projectName: draft.destination.projectName,
        description: draft.scope,
        note: draft.acceptanceCriteria.length
          ? `Acceptance criteria:\n- ${draft.acceptanceCriteria.join("\n- ")}`
          : null,
        estimate: draft.complexity,
        dueDate: draft.targetDate,
        assigneeIntent: "SELF",
      };
    } else if (route === "BONUS") {
      actionKind = "create_bonus_task";
      payload = {
        title: draft.title,
        description: `${draft.scope}\n\nAcceptance Criteria:\n- ${draft.acceptanceCriteria.join("\n- ")}`,
        teamId: draft.destination.teamId ?? "team-mysverse",
        projectId: draft.destination.projectId,
        dueDate: draft.targetDate,
        estimate: draft.complexity,
      };
    } else {
      actionKind = "create_task";
      payload = {
        title: draft.title,
        description: `${draft.scope}\n\nAcceptance Criteria:\n- ${draft.acceptanceCriteria.join("\n- ")}`,
        teamId: draft.destination.teamId ?? "team-mysverse",
        projectId: draft.destination.projectId,
        dueDate: draft.targetDate,
      };
    }

    let payout: ReturnType<typeof buildAssistantPptPayoutPreview> | undefined;
    if (actionKind === "ppt_request") {
      const campaign = await getCampaignBadgeFor({
        scope: "PPT",
        userId,
        rank: profile?.developerRank ?? null,
      });
      const currency = getCurrencyForPaymentMethod(
        profile?.paymentMethod ?? "MYR",
      );
      payout = buildAssistantPptPayoutPreview(
        Number(payload.estimate ?? 3),
        currency,
        campaign,
      );
    }

    const preview = actionPreview(`propose_${actionKind}`, payload, payout);
    const idempotencyKey = `assistant:convert:${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;

    const action = await prisma.assistantAction.create({
      data: {
        conversationId,
        userId,
        kind: actionKind,
        payload: payload as Prisma.InputJsonValue,
        preview: preview as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        idempotencyKey,
      },
      select: {
        id: true,
        kind: true,
        payload: true,
        preview: true,
        status: true,
        expiresAt: true,
        executedAt: true,
        result: true,
        error: true,
        errorCode: true,
      },
    });

    return NextResponse.json({
      success: true,
      action: {
        ...action,
        expiresAt: action.expiresAt.toISOString(),
        executedAt: action.executedAt ? action.executedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("[assistant] draft conversion failed:", error);
    return NextResponse.json(
      { error: "Could not convert task draft." },
      { status: 500 },
    );
  }
}
