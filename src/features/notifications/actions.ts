"use server";

import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "./server/service";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
};

export async function notificationsSnapshotAction(orgSlug: string): Promise<ActionResult<{ unread: number; items: NotificationItem[] }>> {
  return runAction(
    "notifications.snapshot",
    async () => {
      const ctx = await resolveOrgContextForAction(orgSlug);
      const [unread, list] = await Promise.all([unreadNotificationCount(ctx), listNotifications(ctx, { limit: 10 })]);
      return {
        unread,
        items: list.items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          linkPath: n.linkPath,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    },
    { refresh: false },
  );
}

export async function markNotificationReadAction(orgSlug: string, notificationId: string): Promise<ActionResult<null>> {
  return runAction("notifications.markRead", async () => {
    await markNotificationRead(await resolveOrgContextForAction(orgSlug), notificationId);
    return null;
  });
}

export async function markAllNotificationsReadAction(orgSlug: string): Promise<ActionResult<number>> {
  return runAction("notifications.markAllRead", async () => markAllNotificationsRead(await resolveOrgContextForAction(orgSlug)));
}
