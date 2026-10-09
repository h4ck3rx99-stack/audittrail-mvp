import "server-only";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction } from "@/server/audit/record";
import { diffFields, hasChanges } from "@/server/audit/diff";
import { parseInput } from "@/server/validation";
import type { OrgContext } from "@/server/context";
import { assertControlsInOrg, assertMember, assertUuid, nextCounterValue } from "@/server/tenancy";
import { fromDateOnlyOrNull } from "@/lib/dates";
import { riskKey } from "@/lib/utils";
import { parseGapKey } from "@/features/gaps/engine";
import {
  RESOLVED_RISK_STATUSES,
  createRiskSchema,
  riskStatusSchema,
  updateRiskSchema,
} from "../schemas";

async function loadRisk(ctx: OrgContext, riskId: unknown) {
  assertUuid(riskId, "Risk");
  const risk = await db.risk.findFirst({
    where: { id: riskId, organizationId: ctx.org.id },
    include: { controls: { select: { controlId: true, control: { select: { code: true } } } } },
  });
  if (!risk) throw new NotFoundError("Risk not found.");
  return risk;
}

const ARCHIVED = "This risk is archived and can no longer be changed.";

export async function createRisk(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "risk.create");
  const input = parseInput(createRiskSchema, raw);
  const owner = input.ownerId ? await assertMember(db, ctx.org.id, input.ownerId) : null;
  const controls = await assertControlsInOrg(db, ctx.org.id, input.controlIds);
  if (input.gapKey) {
    if (!parseGapKey(input.gapKey))
      throw new ValidationError("Unknown gap reference.", { gapKey: ["Unknown gap reference."] });
    const existing = await db.risk.findFirst({
      where: {
        organizationId: ctx.org.id,
        gapKey: input.gapKey,
        archivedAt: null,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: { number: true },
    });
    if (existing)
      throw new ConflictError(`This gap is already tracked as ${riskKey(existing.number)}.`);
  }

  return withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    const number = await nextCounterValue(tx, ctx.org.id, "risk");
    const risk = await tx.risk.create({
      data: {
        organizationId: ctx.org.id,
        number,
        title: input.title,
        description: input.description,
        kind: input.kind,
        severity: input.severity,
        ownerId: owner?.id ?? null,
        dueDate: fromDateOnlyOrNull(input.dueDate),
        treatmentPlan: input.treatmentPlan,
        source: input.gapKey ? "DETECTED" : "MANUAL",
        gapKey: input.gapKey,
        createdById: ctx.user.id,
        controls: { create: controls.map((c) => ({ controlId: c.id })) },
      },
    });
    await audit.record({
      action: "risk.created",
      resourceType: "risk",
      resourceId: risk.id,
      resourceLabel: riskKey(number),
      metadata: {
        title: risk.title,
        kind: risk.kind,
        severity: risk.severity,
        ownerId: risk.ownerId,
        ownerName: owner?.name ?? null,
        controlCodes: controls.map((c) => c.code),
        source: risk.source,
        gapKey: risk.gapKey,
      },
    });
    if (owner) {
      await notify({
        type: "RISK_ASSIGNED",
        organizationId: ctx.org.id,
        recipientId: owner.id,
        payload: {
          orgSlug: ctx.org.slug,
          riskId: risk.id,
          riskNumber: number,
          riskTitle: risk.title,
          actorName: ctx.user.name,
        },
      });
    }
    return risk;
  });
}

export async function updateRisk(ctx: OrgContext, riskId: unknown, raw: unknown) {
  const before = await loadRisk(ctx, riskId);
  assertCan(ctx, "risk.edit", { ownerId: before.ownerId });
  if (before.archivedAt) throw new ConflictError(ARCHIVED);
  const input = parseInput(updateRiskSchema, raw);
  const owner = input.ownerId ? await assertMember(db, ctx.org.id, input.ownerId) : null;
  const controls = await assertControlsInOrg(db, ctx.org.id, input.controlIds);
  const data = {
    title: input.title,
    description: input.description,
    kind: input.kind,
    severity: input.severity,
    ownerId: owner?.id ?? null,
    dueDate: fromDateOnlyOrNull(input.dueDate),
    treatmentPlan: input.treatmentPlan,
  };
  const changes = diffFields(
    before,
    data,
    ["title", "description", "kind", "severity", "ownerId", "dueDate", "treatmentPlan"],
    {
      dateOnly: ["dueDate"],
    },
  );
  const beforeCodes = before.controls.map((c) => c.control.code).sort();
  const afterCodes = controls.map((c) => c.code).sort();
  if (beforeCodes.join(",") !== afterCodes.join(","))
    changes.controls = { from: beforeCodes, to: afterCodes };
  if (!hasChanges(changes)) return;

  await withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    await tx.risk.updateMany({ where: { id: before.id, organizationId: ctx.org.id }, data });
    if (changes.controls) {
      await tx.riskControl.deleteMany({ where: { riskId: before.id, organizationId: ctx.org.id } });
      await tx.riskControl.createMany({
        data: controls.map((c) => ({
          organizationId: ctx.org.id,
          riskId: before.id,
          controlId: c.id,
        })),
      });
    }
    await audit.record({
      action: "risk.updated",
      resourceType: "risk",
      resourceId: before.id,
      resourceLabel: riskKey(before.number),
      changes,
      ...(changes.ownerId ? { metadata: { toName: owner?.name ?? null } } : {}),
    });
    if (changes.ownerId && owner) {
      await notify({
        type: "RISK_ASSIGNED",
        organizationId: ctx.org.id,
        recipientId: owner.id,
        payload: {
          orgSlug: ctx.org.slug,
          riskId: before.id,
          riskNumber: before.number,
          riskTitle: data.title,
          actorName: ctx.user.name,
        },
      });
    }
  });
}

export async function changeRiskStatus(ctx: OrgContext, riskId: unknown, raw: unknown) {
  const risk = await loadRisk(ctx, riskId);
  const input = parseInput(riskStatusSchema, raw);
  if (input.status === "ACCEPTED") assertCan(ctx, "risk.accept");
  else assertCan(ctx, "risk.edit", { ownerId: risk.ownerId });
  if (risk.archivedAt) throw new ConflictError(ARCHIVED);
  if (input.status === risk.status) return;

  const resolving = (RESOLVED_RISK_STATUSES as readonly string[]).includes(input.status);
  const data = {
    status: input.status,
    resolutionNotes: resolving ? input.resolutionNotes : risk.resolutionNotes,
    resolvedAt: resolving ? new Date() : null,
    resolvedById: resolving ? ctx.user.id : null,
  };
  const changes = diffFields(risk, data, ["status", "resolutionNotes"]);
  const action =
    input.status === "ACCEPTED"
      ? "risk.accepted"
      : resolving
        ? "risk.resolved"
        : "risk.status_changed";
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const res = await tx.risk.updateMany({
      where: { id: risk.id, organizationId: ctx.org.id, status: risk.status },
      data,
    });
    if (res.count === 0)
      throw new ConflictError("This risk was changed by someone else. Reload and try again.");
    await audit.record({
      action,
      resourceType: "risk",
      resourceId: risk.id,
      resourceLabel: riskKey(risk.number),
      changes,
    });
  });
}

export async function archiveRisk(ctx: OrgContext, riskId: unknown) {
  assertCan(ctx, "risk.archive");
  const risk = await loadRisk(ctx, riskId);
  if (risk.archivedAt) throw new ConflictError("This risk is already archived.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.risk.updateMany({
      where: { id: risk.id, organizationId: ctx.org.id },
      data: { archivedAt: new Date() },
    });
    await audit.record({
      action: "risk.archived",
      resourceType: "risk",
      resourceId: risk.id,
      resourceLabel: riskKey(risk.number),
    });
  });
}
