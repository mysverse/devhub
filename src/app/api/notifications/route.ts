import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { recordUserActivityDay } from "@/lib/incentives";
import {
  countUnreadInAppNotifications,
  listInAppNotifications,
  listUnseenInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationsRead,
  markInAppNotificationsSeen,
  serializeInAppDelivery,
} from "@/lib/notifications";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, unread, unseen] = await Promise.all([
    listInAppNotifications(userId, 30),
    countUnreadInAppNotifications(userId),
    listUnseenInAppNotifications(userId, 30),
    recordUserActivityDay(userId),
  ]);

  return NextResponse.json({
    notifications: notifications.map(serializeInAppDelivery),
    unreadCount: unread,
    unseen: unseen.map(serializeInAppDelivery),
  });
}

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: string[];
  };
  const action = body.action ?? "read";
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  switch (action) {
    case "seen":
      await markInAppNotificationsSeen(userId, ids);
      break;
    case "read":
      await markInAppNotificationsRead(userId, ids);
      break;
    case "read-all":
      await markAllInAppNotificationsRead(userId);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
