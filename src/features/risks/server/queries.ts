import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { can, denialReason } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { isUuid } from "@/server/ids";
import { todayInTimeZone, toDateOnlyOrNull } from "@/lib/dates";
import { listResourceActivity } from "@/features/audit/server/service";
import type { RiskListQuery } from "../schemas";

export const RISKS_PAGE_SIZE = 50;

export async function listRisks(ctx: OrgContext, q: RiskListQuery) {
  const where: Prisma.RiskWhereInput = { organizationId: ctx.org.id, archivedAt: q.archived === "1" ? { not: null } : null };
  if (q.status === "active") where.status = { in: ["OPEN", "IN_PROGRESS"] };
  else if (q.status) where.status = q.status;
  if (q.severity) where.severity = q.severity;
  if (q.kind) where.kind = q.kind;
  if (q.owner === "me") where.ownerId = ctx.user.id;
  else if (q.owner) where.ownerId = q.owner;
  const total = await db.risk.count({ where });
  const page = Math.min(q.page ?? 1, Math.max(1, Math.ceil(total / RISKS_PAGE_SIZE)));
  const rows = await db.risk.findMany({
    where,
    orderBy: [{ number: "desc" }],
    skip: (page - 1) * RISKS_PAGE_SIZE,
    take: RISKS_PAGE_SIZE,
    select: {
      id: true,
      number: true,
      title: true,
      kind: true,
      severity: true,
      status: true,
      dueDate: true,
      source: true,
      owner: { select: { name: true } },
      controls: { select: { control: { select: { id: true, code: true } } } },
    },
  });
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const sorted = [...rows].sort((a, b) => rank[a.severity] - rank[b.severity] || b.number - a.number);
  return {
    today: todayInTimeZone(ctx.org.timezone),
    total,
    page,
    pageSize: RISKS_PAGE_SIZE,
    rows: sorted.map((r) => ({ ...r, dueDate: toDateOnlyOrNull(r.dueDate), controls: r.controls.map((c) => c.control) })),
  };
}

export async function getRiskDetail(ctx: OrgContext, riskId: string) {
  if (!isUuid(riskId)) throw new NotFoundError("Risk not found.");
  const r = await db.risk.findFirst({
    where: { id: riskId, organizationId: ctx.org.id },
    include: {
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      controls: { select: { control: { select: { id: true, code: true, name: true } } } },
      tasks: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true, status: true, dueDate: true, assignee: { select: { name: true } } } },
    },
  });
  if (!r) throw new NotFoundError("Risk not found.");
  return {
    risk: {
      ...r,
      dueDate: toDateOnlyOrNull(r.dueDate),
      controls: r.controls.map((c) => c.control),
      tasks: r.tasks.map((t) => ({ ...t, dueDate: toDateOnlyOrNull(t.dueDate) })),
    },
    today: todayInTimeZone(ctx.org.timezone),
    activity: await listResourceActivity(ctx, "risk", r.id, 50),
    permissions: {
      edit: can(ctx, "risk.edit", { ownerId: r.ownerId }),
      editReason: denialReason(ctx, "risk.edit", { ownerId: r.ownerId }),
      accept: can(ctx, "risk.accept"),
      archive: can(ctx, "risk.archive"),
      createTask: can(ctx, "task.create"),
    },
  };
}
