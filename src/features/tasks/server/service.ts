import "server-only";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction } from "@/server/audit/record";
import { diffFields, hasChanges } from "@/server/audit/diff";
import { parseInput } from "@/server/validation";
import type { OrgContext } from "@/server/context";
import { assertControlsInOrg, assertMember, assertUuid, nextCounterValue } from "@/server/tenancy";
import { fromDateOnlyOrNull, toDateOnlyOrNull } from "@/lib/dates";
import { taskKey } from "@/lib/utils";
import { parseGapKey } from "@/features/gaps/engine";
import { assignTaskSchema, createTaskSchema, taskStatusSchema, updateTaskSchema } from "../schemas";

async function loadTask(ctx: OrgContext, taskId: unknown) {
  assertUuid(taskId, "Task");
  const task = await db.task.findFirst({
    where: { id: taskId, organizationId: ctx.org.id },
    include: { controls: { select: { controlId: true, control: { select: { code: true } } } } },
  });
  if (!task) throw new NotFoundError("Task not found.");
  return task;
}

export async function createTask(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "task.create");
  const input = parseInput(createTaskSchema, raw);
  const assignee = input.assigneeId ? await assertMember(db, ctx.org.id, input.assigneeId) : null;
  const controls = await assertControlsInOrg(db, ctx.org.id, input.controlIds);
  if (input.riskId) {
    const risk = await db.risk.findFirst({ where: { id: input.riskId, organizationId: ctx.org.id }, select: { id: true } });
    if (!risk) throw new NotFoundError("Risk not found.");
  }
  if (input.gapKey && !parseGapKey(input.gapKey)) {
    throw new ValidationError("Unknown gap reference.", { gapKey: ["Unknown gap reference."] });
  }

  return withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    const number = await nextCounterValue(tx, ctx.org.id, "task");
    const task = await tx.task.create({
      data: {
        organizationId: ctx.org.id,
        number,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: assignee?.id ?? null,
        createdById: ctx.user.id,
        dueDate: fromDateOnlyOrNull(input.dueDate),
        riskId: input.riskId,
        source: input.gapKey ? "GAP" : "MANUAL",
        gapKey: input.gapKey,
        controls: { create: controls.map((c) => ({ controlId: c.id })) },
      },
    });
    await audit.record({
      action: "task.created",
      resourceType: "task",
      resourceId: task.id,
      resourceLabel: taskKey(number),
      metadata: {
        title: task.title,
        priority: task.priority,
        assigneeId: task.assigneeId,
        assigneeName: assignee?.name ?? null,
        dueDate: input.dueDate,
        controlCodes: controls.map((c) => c.code),
        riskId: input.riskId,
        gapKey: input.gapKey,
      },
    });
    if (assignee) {
      await notify({
        type: "TASK_ASSIGNED",
        organizationId: ctx.org.id,
        recipientId: assignee.id,
        payload: { orgSlug: ctx.org.slug, taskId: task.id, taskNumber: number, taskTitle: task.title, actorName: ctx.user.name },
      });
    }
    return task;
  });
}

export async function updateTask(ctx: OrgContext, taskId: unknown, raw: unknown) {
  const before = await loadTask(ctx, taskId);
  assertCan(ctx, "task.edit", { createdById: before.createdById, assigneeId: before.assigneeId });
  const input = parseInput(updateTaskSchema, raw);
  const controls = await assertControlsInOrg(db, ctx.org.id, input.controlIds);
  const data = {
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: fromDateOnlyOrNull(input.dueDate),
  };
  const changes = diffFields(before, data, ["title", "description", "priority", "dueDate"], { dateOnly: ["dueDate"] });
  const beforeCodes = before.controls.map((c) => c.control.code).sort();
  const afterCodes = controls.map((c) => c.code).sort();
  if (beforeCodes.join(",") !== afterCodes.join(",")) changes.controls = { from: beforeCodes, to: afterCodes };
  if (!hasChanges(changes)) return;

  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.task.updateMany({ where: { id: before.id, organizationId: ctx.org.id }, data });
    if (changes.controls) {
      await tx.taskControl.deleteMany({ where: { taskId: before.id, organizationId: ctx.org.id } });
      await tx.taskControl.createMany({ data: controls.map((c) => ({ organizationId: ctx.org.id, taskId: before.id, controlId: c.id })) });
    }
    await audit.record({ action: "task.updated", resourceType: "task", resourceId: before.id, resourceLabel: taskKey(before.number), changes });
  });
}

export async function assignTask(ctx: OrgContext, taskId: unknown, raw: unknown) {
  const task = await loadTask(ctx, taskId);
  assertCan(ctx, "task.edit", { createdById: task.createdById, assigneeId: task.assigneeId });
  const input = parseInput(assignTaskSchema, raw);
  if (task.assigneeId === input.assigneeId) return;
  const assignee = input.assigneeId ? await assertMember(db, ctx.org.id, input.assigneeId) : null;
  const previous = task.assigneeId ? await db.user.findUnique({ where: { id: task.assigneeId }, select: { name: true } }) : null;
  await withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    await tx.task.updateMany({ where: { id: task.id, organizationId: ctx.org.id }, data: { assigneeId: assignee?.id ?? null } });
    await audit.record({
      action: "task.assigned",
      resourceType: "task",
      resourceId: task.id,
      resourceLabel: taskKey(task.number),
      changes: { assigneeId: { from: task.assigneeId, to: assignee?.id ?? null } },
      metadata: { fromName: previous?.name ?? null, toName: assignee?.name ?? null },
    });
    if (assignee) {
      await notify({
        type: "TASK_ASSIGNED",
        organizationId: ctx.org.id,
        recipientId: assignee.id,
        payload: { orgSlug: ctx.org.slug, taskId: task.id, taskNumber: task.number, taskTitle: task.title, actorName: ctx.user.name },
      });
    }
  });
}

const CLOSED = new Set(["DONE", "CANCELED"]);

export async function changeTaskStatus(ctx: OrgContext, taskId: unknown, raw: unknown) {
  const task = await loadTask(ctx, taskId);
  assertCan(ctx, "task.edit", { createdById: task.createdById, assigneeId: task.assigneeId });
  const { status } = parseInput(taskStatusSchema, raw);
  if (status === task.status) return;

  const completing = status === "DONE";
  const reopening = CLOSED.has(task.status) && !CLOSED.has(status);
  const data = {
    status,
    completedAt: completing ? new Date() : reopening || status === "CANCELED" ? null : task.completedAt,
    completedById: completing ? ctx.user.id : reopening || status === "CANCELED" ? null : task.completedById,
  };
  const action = completing ? "task.completed" : reopening ? "task.reopened" : "task.status_changed";
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const res = await tx.task.updateMany({ where: { id: task.id, organizationId: ctx.org.id, status: task.status }, data });
    if (res.count === 0) throw new ConflictError("This task was changed by someone else. Reload and try again.");
    await audit.record({
      action,
      resourceType: "task",
      resourceId: task.id,
      resourceLabel: taskKey(task.number),
      changes: { status: { from: task.status, to: status } },
    });
  });
}

/** Hard delete. The audit event keeps a full snapshot of the task. */
export async function deleteTask(ctx: OrgContext, taskId: unknown) {
  const task = await loadTask(ctx, taskId);
  assertCan(ctx, "task.delete", { createdById: task.createdById });
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.taskControl.deleteMany({ where: { taskId: task.id, organizationId: ctx.org.id } });
    const res = await tx.task.deleteMany({ where: { id: task.id, organizationId: ctx.org.id } });
    if (res.count === 0) throw new NotFoundError("Task not found.");
    await audit.record({
      action: "task.deleted",
      resourceType: "task",
      resourceId: task.id,
      resourceLabel: taskKey(task.number),
      metadata: {
        snapshot: {
          number: task.number,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeId: task.assigneeId,
          createdById: task.createdById,
          dueDate: toDateOnlyOrNull(task.dueDate),
          completedAt: task.completedAt?.toISOString() ?? null,
          riskId: task.riskId,
          source: task.source,
          gapKey: task.gapKey,
          controlCodes: task.controls.map((c) => c.control.code),
          createdAt: task.createdAt.toISOString(),
        },
      },
    });
  });
}
