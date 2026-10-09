import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { can, denialReason } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { isUuid } from "@/server/ids";
import { addDays, fromDateOnly, todayInTimeZone, toDateOnlyOrNull } from "@/lib/dates";
import { listResourceActivity } from "@/features/audit/server/service";
import type { TaskListQuery } from "../schemas";

export const TASKS_PAGE_SIZE = 50;
const OPEN = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

export async function listTasks(ctx: OrgContext, q: TaskListQuery) {
  const today = todayInTimeZone(ctx.org.timezone);
  const view = q.view ?? "mine";
  const where: Prisma.TaskWhereInput = { organizationId: ctx.org.id };
  const and: Prisma.TaskWhereInput[] = [];

  if (view === "mine") {
    where.assigneeId = ctx.user.id;
    if (!q.status) where.status = { in: [...OPEN] };
  }
  if (q.status === "open") where.status = { in: [...OPEN] };
  else if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (view !== "mine") {
    if (q.assignee === "me") where.assigneeId = ctx.user.id;
    else if (q.assignee === "unassigned") where.assigneeId = null;
    else if (q.assignee) where.assigneeId = q.assignee;
  }
  if (q.due === "overdue")
    and.push({ dueDate: { lt: fromDateOnly(today) }, status: { in: [...OPEN] } });
  if (q.due === "week")
    and.push({ dueDate: { gte: fromDateOnly(today), lte: fromDateOnly(addDays(today, 7)) } });
  if (q.due === "none") and.push({ dueDate: null });
  if (q.control) where.controls = { some: { controlId: q.control, organizationId: ctx.org.id } };
  if (q.source) where.source = q.source;
  if (q.q) {
    const n = Number(q.q.replace(/^tsk-?/i, ""));
    and.push({
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }
  if (and.length) where.AND = and;

  const total = await db.task.count({ where });
  const page = Math.min(q.page ?? 1, Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE)));
  const rows = await db.task.findMany({
    where,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    skip: (page - 1) * TASKS_PAGE_SIZE,
    take: TASKS_PAGE_SIZE,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      source: true,
      assignee: { select: { name: true } },
      controls: { select: { control: { select: { id: true, code: true } } } },
    },
  });
  return {
    today,
    view,
    total,
    page,
    pageSize: TASKS_PAGE_SIZE,
    rows: rows.map((t) => ({
      ...t,
      dueDate: toDateOnlyOrNull(t.dueDate),
      controls: t.controls.map((c) => c.control),
    })),
  };
}

export async function getTaskDetail(ctx: OrgContext, taskId: string) {
  if (!isUuid(taskId)) throw new NotFoundError("Task not found.");
  const t = await db.task.findFirst({
    where: { id: taskId, organizationId: ctx.org.id },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      completedBy: { select: { name: true } },
      risk: { select: { id: true, number: true, title: true } },
      controls: { select: { control: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!t) throw new NotFoundError("Task not found.");
  const resource = { createdById: t.createdById, assigneeId: t.assigneeId };
  return {
    task: {
      ...t,
      dueDate: toDateOnlyOrNull(t.dueDate),
      controls: t.controls.map((c) => c.control),
    },
    today: todayInTimeZone(ctx.org.timezone),
    activity: await listResourceActivity(ctx, "task", t.id, 50),
    permissions: {
      edit: can(ctx, "task.edit", resource),
      editReason: denialReason(ctx, "task.edit", resource),
      delete: can(ctx, "task.delete", { createdById: t.createdById }),
      deleteReason: denialReason(ctx, "task.delete", { createdById: t.createdById }),
    },
  };
}

/** Options for task forms: members, controls and risks of this org. */
export async function getTaskFormOptions(ctx: OrgContext) {
  const [members, controls, risks] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: ctx.org.id },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
    db.control.findMany({
      where: { organizationId: ctx.org.id, archivedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.risk.findMany({
      where: { organizationId: ctx.org.id, archivedAt: null },
      orderBy: { number: "desc" },
      select: { id: true, number: true, title: true },
    }),
  ]);
  return { members: members.map((m) => m.user), controls, risks };
}
