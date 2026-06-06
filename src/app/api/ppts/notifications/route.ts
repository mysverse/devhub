import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { recordUserActivityDay } from "@/lib/incentives";
import prisma from "@/lib/prisma";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await recordUserActivityDay(userId);

  const notifications = await prisma.pptNotification.findMany({
    where: { userId, readAt: null },
    include: {
      state: {
        select: {
          linearIssueIdentifier: true,
          linearIssueTitle: true,
          linearIssueUrl: true,
          status: true,
          reason: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      identifier: notification.state.linearIssueIdentifier,
      issueTitle: notification.state.linearIssueTitle,
      issueUrl: notification.state.linearIssueUrl,
      status: notification.state.status,
      reason: notification.state.reason,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  await prisma.pptNotification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
