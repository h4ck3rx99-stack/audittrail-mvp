import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { assertCan, can } from "@/server/authz/permissions";
import { withAuditedTransaction } from "@/server/audit/record";
import { orgChainKey } from "@/server/audit/hash";
import { verifyAuditChain } from "@/server/audit/verify";
import { AUDIT_ACTIONS, RESOURCE_TYPES, type AuditCategory } from "@/server/audit/catalog";
import { describeAction } from "@/server/audit/describe";
import type { OrgContext } from "@/server/context";
import { assertUuid } from "@/server/tenancy";
import { isDateOnly, zonedStartOfDayUtc, addDays } from "@/lib/dates";

export const auditLogQuerySchema = z.object({
  actor: z.uuid().optional().catch(undefined),
  category: z
    .enum(Object.keys(AUDIT_ACTIONS) as [AuditCategory, ...AuditCategory[]])
    .optional()
    .catch(undefined),
  resourceType: z.enum(RESOURCE_TYPES).optional().catch(undefined),
  from: z.string().refine(isDateOnly).optional().catch(undefined),
  to: z.string().refine(isDateOnly).optional().catch(undefined),
  cursor: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional()
    .catch(undefined),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const AUDIT_PAGE_SIZE = 50;

function whereFor(ctx: OrgContext, q: AuditLogQuery): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {
    chainKey: orgChainKey(ctx.org.id),
    organizationId: ctx.org.id,
  };
  if (q.actor) where.actorUserId = q.actor;
  if (q.category) where.action = { in: [...AUDIT_ACTIONS[q.category]] };
  if (q.resourceType) where.resourceType = q.resourceType;
  if (q.from || q.to) {
    where.occurredAt = {
      ...(q.from ? { gte: zonedStartOfDayUtc(q.from, ctx.org.timezone) } : {}),
      ...(q.to ? { lt: zonedStartOfDayUtc(addDays(q.to, 1), ctx.org.timezone) } : {}),
    };
  }
  return where;
}

const EVENT_SELECT = {
  id: true,
  sequence: true,
  occurredAt: true,
  actorType: true,
  actorUserId: true,
  actorEmail: true,
  actorName: true,
  actorRole: true,
  action: true,
  resourceType: true,
  resourceId: true,
  resourceLabel: true,
  changes: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
  prevHash: true,
  hash: true,
} as const;

type RawEvent = Prisma.AuditEventGetPayload<{ select: typeof EVENT_SELECT }>;

/** Strips IP and user agent unless the viewer may see request context (Owner/Admin). */
function present(ctx: OrgContext, e: RawEvent) {
  const showContext = can(ctx, "auditLog.viewRequestContext");
  return {
    ...e,
    sequence: e.sequence.toString(),
    ipAddress: showContext ? e.ipAddress : null,
    userAgent: showContext ? e.userAgent : null,
    summary: describeAction({ ...e }),
  };
}
export type PresentedAuditEvent = ReturnType<typeof present>;

export async function listAuditEvents(ctx: OrgContext, q: AuditLogQuery) {
  assertCan(ctx, "auditLog.view");
  const where = whereFor(ctx, q);
  if (q.cursor) where.sequence = { lt: BigInt(q.cursor) };
  const rows = await db.auditEvent.findMany({
    where,
    orderBy: { sequence: "desc" },
    take: AUDIT_PAGE_SIZE + 1,
    select: EVENT_SELECT,
  });
  const items = rows.slice(0, AUDIT_PAGE_SIZE).map((e) => present(ctx, e));
  const nextCursor = rows.length > AUDIT_PAGE_SIZE ? (items.at(-1)?.sequence ?? null) : null;
  return { items, nextCursor };
}

export async function getAuditEvent(ctx: OrgContext, eventId: unknown) {
  assertCan(ctx, "auditLog.view");
  assertUuid(eventId, "Event");
  const e = await db.auditEvent.findFirst({
    where: { id: eventId, organizationId: ctx.org.id, chainKey: orgChainKey(ctx.org.id) },
    select: EVENT_SELECT,
  });
  if (!e) throw new NotFoundError("Event not found.");
  return present(ctx, e);
}

/** Activity feed for a resource (and, for controls, its evidence links). */
export async function listResourceActivity(
  ctx: OrgContext,
  resourceType: string,
  resourceId: string,
  limit = 50,
) {
  const or: Prisma.AuditEventWhereInput[] = [{ resourceType, resourceId }];
  if (resourceType === "control") {
    or.push({
      resourceType: "evidence",
      action: { in: ["evidence.linked", "evidence.unlinked"] },
      metadata: { path: ["controlId"], equals: resourceId },
    });
    or.push({
      resourceType: "evidence_requirement",
      metadata: { path: ["controlId"], equals: resourceId },
    });
  }
  const rows = await db.auditEvent.findMany({
    where: { organizationId: ctx.org.id, chainKey: orgChainKey(ctx.org.id), OR: or },
    orderBy: { sequence: "desc" },
    take: limit,
    select: EVENT_SELECT,
  });
  return rows.map((e) => present(ctx, e));
}

export async function listRecentActivity(
  ctx: OrgContext,
  options: { limit?: number; actorUserId?: string } = {},
) {
  const rows = await db.auditEvent.findMany({
    where: {
      organizationId: ctx.org.id,
      chainKey: orgChainKey(ctx.org.id),
      action: { notIn: ["member.logged_in", "evidence.downloaded"] },
      ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
    },
    orderBy: { sequence: "desc" },
    take: options.limit ?? 15,
    select: EVENT_SELECT,
  });
  return rows.map((e) => present(ctx, e));
}

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** CSV cell with formula-injection neutralization and RFC 4180 quoting. */
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (CSV_FORMULA_PREFIX.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  "sequence",
  "occurredAt",
  "actorName",
  "actorEmail",
  "actorRole",
  "action",
  "summary",
  "resourceType",
  "resourceId",
  "resourceLabel",
  "changes",
  "metadata",
  "ipAddress",
  "userAgent",
  "requestId",
  "prevHash",
  "hash",
] as const;

/**
 * Streams the filtered audit log as CSV. The export itself is audited first, recording the filters
 * and the number of rows (events up to the current chain head).
 */
export async function exportAuditLogCsv(
  ctx: OrgContext,
  q: AuditLogQuery,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  assertCan(ctx, "auditLog.export");
  const where = whereFor(ctx, { ...q, cursor: undefined });
  const head = await db.auditChainHead.findUnique({
    where: { chainKey: orgChainKey(ctx.org.id) },
    select: { lastSequence: true },
  });
  const upTo = head?.lastSequence ?? 0n;
  const rowCount = await db.auditEvent.count({ where: { ...where, sequence: { lte: upTo } } });

  await withAuditedTransaction(ctx, async ({ audit }) => {
    await audit.record({
      action: "audit_log.exported",
      resourceType: "audit_log",
      resourceLabel: "Audit log",
      metadata: { rowCount, upToSequence: upTo.toString(), filters: { ...q, cursor: undefined } },
    });
  });

  const encoder = new TextEncoder();
  let cursor = 0n;
  let headerSent = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(encoder.encode(`${CSV_COLUMNS.join(",")}\r\n`));
        headerSent = true;
        return;
      }
      const batch = await db.auditEvent.findMany({
        where: { ...where, sequence: { gt: cursor, lte: upTo } },
        orderBy: { sequence: "asc" },
        take: 500,
        select: EVENT_SELECT,
      });
      if (batch.length === 0) {
        controller.close();
        return;
      }
      const lines = batch.map((raw) => {
        const e = present(ctx, raw);
        const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
          ...e,
          occurredAt: raw.occurredAt.toISOString(),
        };
        return CSV_COLUMNS.map((c) => csvCell(row[c])).join(",");
      });
      controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
      cursor = batch.at(-1)!.sequence;
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  return { stream, filename: `audittrail-${ctx.org.slug}-audit-log-${date}.csv` };
}

export async function verifyOrganizationChain(ctx: OrgContext) {
  assertCan(ctx, "auditLog.verify");
  const result = await verifyAuditChain(orgChainKey(ctx.org.id));
  await withAuditedTransaction(ctx, async ({ audit }) => {
    await audit.record({
      action: "audit_log.verified",
      resourceType: "audit_log",
      resourceLabel: "Audit log",
      metadata: result.valid
        ? { valid: true, eventCount: result.eventCount, headHash: result.headHash }
        : {
            valid: false,
            eventCount: result.eventCount,
            brokenAtSequence: result.brokenAtSequence,
            reason: result.reason,
          },
    });
  });
  return result;
}

export async function listAuditActors(ctx: OrgContext) {
  const rows = await db.auditEvent.findMany({
    where: {
      organizationId: ctx.org.id,
      chainKey: orgChainKey(ctx.org.id),
      actorUserId: { not: null },
    },
    distinct: ["actorUserId"],
    orderBy: { actorUserId: "asc" },
    select: { actorUserId: true, actorName: true },
  });
  return rows.filter(
    (r): r is { actorUserId: string; actorName: string | null } => r.actorUserId !== null,
  );
}
