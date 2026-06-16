import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Gift,
  type LucideIcon,
  Package,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import {
  type NotificationPresentation,
  notificationPresentation,
} from "@/lib/notifications/copy";

dayjs.extend(relativeTime);

/** Flat notification shape returned by /api/notifications and consumed by the
 * toast, bell dropdown, and notifications page. */
export type AppNotification = {
  id: string;
  notificationId: string;
  domain: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

export type NotificationVisual = NotificationPresentation & {
  Icon: LucideIcon;
};

/** Resolve copy (heading/color/tone) plus the icon for a notification. Tone
 * drives the icon first, then domain-specific fallbacks. */
export function notificationVisual(
  domain: string,
  type: string,
): NotificationVisual {
  const copy = notificationPresentation(domain, type);
  let Icon: LucideIcon = Bell;
  if (copy.tone === "positive") Icon = CheckCircle2;
  else if (copy.tone === "warning") Icon = PauseCircle;
  else if (copy.tone === "critical") Icon = AlertTriangle;
  else if (domain === "bonus") Icon = Sparkles;
  else if (domain === "incentive") Icon = Gift;
  else if (domain === "welcome_pack") Icon = Package;
  return { ...copy, Icon };
}

export function timeAgo(iso: string): string {
  return dayjs(iso).fromNow();
}
