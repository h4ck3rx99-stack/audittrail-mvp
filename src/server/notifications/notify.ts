import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { absoluteUrl, sendEmail } from "@/server/email";
import { buildNotification, type NotificationPayloads } from "./registry";

export type NotifyInput = {
  [K in NotificationType]: {
    type: K;
    organizationId: string;
    recipientId: string;
    payload: NotificationPayloads[K];
    /** Makes the notification idempotent per recipient (used by the compliance scan). */
    dedupeKey?: string;
  };
}[NotificationType];

/**
 * Writes an in-app notification row inside the caller's transaction.
 * Never notifies actors about their own actions.
 * Returns a post-commit email callback when an email copy should be sent, else null.
 */
export async function createNotification(
  tx: Tx,
  actorUserId: string | null,
  input: NotifyInput,
): Promise<(() => Promise<void>) | null> {
  if (actorUserId && input.recipientId === actorUserId) return null;

  const built = buildNotification(input.type, input.payload as never);
  const result = await tx.notification.createMany({
    data: [
      {
        organizationId: input.organizationId,
        recipientId: input.recipientId,
        type: input.type,
        title: built.title.slice(0, 300),
        body: built.body?.slice(0, 2000) ?? null,
        linkPath: built.linkPath,
        resourceType: built.resourceType,
        resourceId: built.resourceId,
        dedupeKey: input.dedupeKey ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (result.count === 0 || !built.email) return null;

  const recipient = await tx.user.findUnique({
    where: { id: input.recipientId },
    select: { email: true },
  });
  if (!recipient) return null;
  return async () => {
    await sendEmail({
      to: recipient.email,
      subject: built.title,
      text: `${built.body ?? built.title}\n\nOpen in AuditTrail: ${absoluteUrl(built.linkPath)}\n`,
    });
  };
}
