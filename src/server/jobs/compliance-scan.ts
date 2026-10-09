import "server-only";
import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { addDays, todayInTimeZone, toDateOnly } from "@/lib/dates";
import { createNotification, type NotifyInput } from "@/server/notifications/notify";
import { pruneRateLimitBuckets } from "@/server/rate-limit";

export const TASK_DUE_SOON_DAYS = 3;
export const EVIDENCE_EXPIRING_DAYS = 30;
export const CONTROL_REVIEW_DUE_DAYS = 7;

export type ScanSummary = {
  organizations: number;
  candidates: number;
  created: number;
};

/**
 * Finds due-soon and overdue tasks, expiring and expired evidence, and due control reviews, and
 * upserts notifications by dedupeKey. Idempotent: running it twice creates nothing new.
 */
export async function runComplianceScan(now: Date = new Date()): Promise<ScanSummary> {
  const orgs = await db.organization.findMany({ select: { id: true, slug: true, timezone: true } });
  let candidates = 0;
  let created = 0;

  for (const org of orgs) {
    const today = todayInTimeZone(org.timezone, now);
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const inputs: NotifyInput[] = [];

    const tasks = await db.task.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
        assigneeId: { not: null },
        dueDate: {
          not: null,
          lte: new Date(`${addDays(today, TASK_DUE_SOON_DAYS)}T00:00:00.000Z`),
        },
      },
      select: { id: true, number: true, title: true, dueDate: true, assigneeId: true },
    });
    for (const t of tasks) {
      const due = toDateOnly(t.dueDate!);
      const overdue = due < today;
      const payload = {
        orgSlug: org.slug,
        taskId: t.id,
        taskNumber: t.number,
        taskTitle: t.title,
        dueDate: due,
      };
      inputs.push(
        overdue
          ? {
              type: "TASK_OVERDUE",
              organizationId: org.id,
              recipientId: t.assigneeId!,
              payload,
              dedupeKey: `task_overdue:${t.id}:${due}`,
            }
          : {
              type: "TASK_DUE_SOON",
              organizationId: org.id,
              recipientId: t.assigneeId!,
              payload,
              dedupeKey: `task_due_soon:${t.id}:${due}`,
            },
      );
    }

    const evidence = await db.evidence.findMany({
      where: {
        organizationId: org.id,
        deletedAt: null,
        status: "APPROVED",
        validUntil: {
          not: null,
          lte: new Date(`${addDays(today, EVIDENCE_EXPIRING_DAYS)}T00:00:00.000Z`),
        },
      },
      select: {
        id: true,
        title: true,
        validUntil: true,
        uploadedById: true,
        currentVersion: { select: { uploadedById: true } },
        controlLinks: { select: { control: { select: { ownerId: true, archivedAt: true } } } },
      },
    });
    for (const e of evidence) {
      const validUntil = toDateOnly(e.validUntil!);
      const expired = validUntil < today;
      const recipients = new Set<string>([e.currentVersion?.uploadedById ?? e.uploadedById]);
      for (const l of e.controlLinks)
        if (l.control.ownerId && !l.control.archivedAt) recipients.add(l.control.ownerId);
      const payload = { orgSlug: org.slug, evidenceId: e.id, evidenceTitle: e.title, validUntil };
      for (const recipientId of recipients) {
        inputs.push(
          expired
            ? {
                type: "EVIDENCE_EXPIRED",
                organizationId: org.id,
                recipientId,
                payload,
                dedupeKey: `evidence_expired:${e.id}:${validUntil}`,
              }
            : {
                type: "EVIDENCE_EXPIRING",
                organizationId: org.id,
                recipientId,
                payload,
                dedupeKey: `evidence_expiring:${e.id}:${validUntil}`,
              },
        );
      }
    }

    const controls = await db.control.findMany({
      where: {
        organizationId: org.id,
        archivedAt: null,
        status: { not: "NOT_APPLICABLE" },
        ownerId: { not: null },
        nextReviewDate: {
          not: null,
          lte: new Date(`${addDays(today, CONTROL_REVIEW_DUE_DAYS)}T00:00:00.000Z`),
        },
      },
      select: { id: true, code: true, name: true, ownerId: true, nextReviewDate: true },
    });
    for (const c of controls) {
      const due = toDateOnly(c.nextReviewDate!);
      inputs.push({
        type: "CONTROL_REVIEW_DUE",
        organizationId: org.id,
        recipientId: c.ownerId!,
        payload: {
          orgSlug: org.slug,
          controlId: c.id,
          controlCode: c.code,
          controlName: c.name,
          dueDate: due,
          overdue: c.nextReviewDate! < todayDate,
        },
        dedupeKey: `control_review_due:${c.id}:${due}`,
      });
    }

    // Only current members receive notifications.
    const members = new Set(
      (
        await db.organizationMember.findMany({
          where: { organizationId: org.id },
          select: { userId: true },
        })
      ).map((m) => m.userId),
    );
    const eligible = inputs.filter((i) => members.has(i.recipientId));
    candidates += eligible.length;
    if (eligible.length === 0) continue;

    const emails: (() => Promise<void>)[] = [];
    await db.$transaction(
      async (tx) => {
        for (const input of eligible) {
          const before = await tx.notification.count({
            where: { recipientId: input.recipientId, dedupeKey: input.dedupeKey },
          });
          const email = await createNotification(tx, null, input);
          if (before === 0) created += 1;
          if (email) emails.push(email);
        }
      },
      { timeout: 60_000 },
    );
    for (const send of emails) {
      try {
        await send();
      } catch (error) {
        logger.error({ err: error }, "compliance scan email failed");
      }
    }
  }

  await pruneRateLimitBuckets();
  logger.info({ organizations: orgs.length, candidates, created }, "compliance scan finished");
  return { organizations: orgs.length, candidates, created };
}
