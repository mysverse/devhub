"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AppNotification } from "@/components/notifications/presentation";

type NotificationsContextValue = {
  /** Recent in-app notifications (read + unread), newest-first. */
  notifications: AppNotification[];
  /** Notifications not yet shown as a toast — drives NotificationPoller. */
  unseen: AppNotification[];
  unreadCount: number;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  markSeen: (ids: string[]) => Promise<void>;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }
  return ctx;
}

type NotificationResponse = {
  notifications?: AppNotification[];
  unseen?: AppNotification[];
  unreadCount?: number;
};

async function post(action: string, ids?: string[]) {
  await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { action, ids } : { action }),
  }).catch(() => undefined);
}

/** Minimum gap between polls — guards against rapid focus events hammering
 * the API. Forced refreshes (after a mutation) bypass it. */
const MIN_POLL_GAP_MS = 5_000;
const POLL_INTERVAL_MS = 30_000;

export default function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unseen, setUnseen] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const inFlight = useRef(false);
  const lastPolledAt = useRef(0);
  const activeRef = useRef(true);

  const poll = useCallback(async (force = false) => {
    if (!force && (document.hidden || inFlight.current)) return;
    if (!force && Date.now() - lastPolledAt.current < MIN_POLL_GAP_MS) return;
    lastPolledAt.current = Date.now();
    inFlight.current = true;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok || !activeRef.current) return;
      const data = (await response.json()) as NotificationResponse;
      setNotifications(data.notifications ?? []);
      setUnseen(data.unseen ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const pollWhenVisible = () => {
      if (!document.hidden) void poll();
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    window.addEventListener("focus", pollWhenVisible);
    document.addEventListener("visibilitychange", pollWhenVisible);

    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", pollWhenVisible);
      document.removeEventListener("visibilitychange", pollWhenVisible);
    };
  }, [poll]);

  const markSeen = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setUnseen((prev) => prev.filter((n) => !ids.includes(n.id)));
    await post("seen", ids);
  }, []);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          idSet.has(n.id) && n.readAt == null ? { ...n, readAt: nowIso } : n,
        ),
      );
      setUnreadCount((count) => {
        const cleared = notifications.filter(
          (n) => idSet.has(n.id) && n.readAt == null,
        ).length;
        return Math.max(0, count - cleared);
      });
      await post("read", ids);
      // Reconcile the badge for ids outside the cached list.
      void poll(true);
    },
    [notifications, poll],
  );

  const markAllRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt == null ? { ...n, readAt: nowIso } : n)),
    );
    setUnreadCount(0);
    await post("read-all");
    void poll(true);
  }, [poll]);

  const refresh = useCallback(() => {
    void poll(true);
  }, [poll]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unseen,
      unreadCount,
      markRead,
      markAllRead,
      markSeen,
      refresh,
    }),
    [
      notifications,
      unseen,
      unreadCount,
      markRead,
      markAllRead,
      markSeen,
      refresh,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
