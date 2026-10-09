import "server-only";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { OrgContext } from "@/server/context";
import { assertUuid } from "@/server/tenancy";

/**
 * In-app notifications are scoped to the recipient and the current organization. Invitation
 * notifications are addressed to a person who is not yet a member, so they are shown in every
 * organization context of that recipient.
 */
function scope(ctx: OrgContext) {
  return {
    recipientId: ctx.user.id,
    OR: [{ organizationId: ctx.org.id }, { type: "INVITATION_RECEIVED" as const }],
  };
}

export async function listNotifications(
  ctx: OrgContext,
  options: { limit?: number; unreadOnly?: boolean; before?: string | null } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  let beforeDate: Date | undefined;
  if (options.before) {
    assertUuid(options.before, "Notification");
    const anchor = await db.notification.findFirst({
      where: { id: options.before, ...scope(ctx) },
      select: { createdAt: true },
    });
    beforeDate = anchor?.createdAt;
  }
  const rows = await db.notification.findMany({
    where: {
      ...scope(ctx),
      ...(options.unreadOnly ? { readAt: null } : {}),
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      linkPath: true,
      readAt: true,
      createdAt: true,
    },
  });
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function unreadNotificationCount(ctx: OrgContext): Promise<number> {
  return db.notification.count({ where: { ...scope(ctx), readAt: null } });
}

export async function markNotificationRead(ctx: OrgContext, notificationId: unknown) {
  assertUuid(notificationId, "Notification");
  const res = await db.notification.updateMany({
    where: { id: notificationId, ...scope(ctx), readAt: null },
    data: { readAt: new Date() },
  });
  if (res.count === 0) {
    const exists = await db.notification.findFirst({
      where: { id: notificationId, ...scope(ctx) },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Notification not found.");
  }
}

export async function markAllNotificationsRead(ctx: OrgContext) {
  const res = await db.notification.updateMany({
    where: { ...scope(ctx), readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}
