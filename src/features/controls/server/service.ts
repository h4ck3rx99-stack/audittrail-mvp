import "server-only";
import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction } from "@/server/audit/record";
import { diffFields, hasChanges } from "@/server/audit/diff";
import { parseInput } from "@/server/validation";
import type { OrgContext } from "@/server/context";
import { assertMember, assertUuid } from "@/server/tenancy";
import { fromDateOnly, fromDateOnlyOrNull, todayInTimeZone, toDateOnlyOrNull } from "@/lib/dates";
import { computeNextReviewDate } from "@/features/readiness/engine";
import {
  assignOwnerSchema,
  bulkAssignSchema,
  bulkStatusSchema,
  createControlSchema,
  evidenceRequirementSchema,
  recordReviewSchema,
  setNextReviewDateSchema,
  updateControlDefinitionSchema,
  updateControlNotesSchema,
  updateControlStatusSchema,
} from "../schemas";

const ARCHIVED_MESSAGE = "This control is archived. Restore it before making changes.";

async function loadControl(client: Tx | typeof db, ctx: OrgContext, controlId: unknown) {
  assertUuid(controlId, "Control");
  const control = await client.control.findFirst({ where: { id: controlId, organizationId: ctx.org.id } });
  if (!control) throw new NotFoundError("Control not found.");
  return control;
}

/** Optimistic concurrency: the update only applies if the version the user edited is current. */
async function updateVersioned(tx: Tx, ctx: OrgContext, id: string, version: number, data: Parameters<Tx["control"]["updateMany"]>[0]["data"]) {
  const res = await tx.control.updateMany({
    where: { id, organizationId: ctx.org.id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count === 0) throw new ConflictError("This control was changed by someone else. Reload to see the latest version, then try again.");
}

/** Requirements that belong to frameworks the organization has adopted. */
async function assertAdoptedRequirements(client: Tx | typeof db, ctx: OrgContext, requirementIds: readonly string[]) {
  const unique = [...new Set(requirementIds)];
  if (unique.length === 0) return [];
  const rows = await client.frameworkRequirement.findMany({
    where: {
      id: { in: unique },
      kind: "REQUIREMENT",
      framework: { organizationAdoptions: { some: { organizationId: ctx.org.id } } },
    },
    select: { id: true, code: true },
  });
  if (rows.length !== unique.length) throw new NotFoundError("Requirement not found.");
  return rows;
}

export async function suggestNextControlCode(ctx: OrgContext, prefix = "CUS"): Promise<string> {
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "CUS";
  const rows = await db.control.findMany({
    where: { organizationId: ctx.org.id, code: { startsWith: `${clean}-` } },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = Number(r.code.slice(clean.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${clean}-${String(max + 1).padStart(2, "0")}`;
}

export async function createControl(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(createControlSchema, raw);
  const requirements = await assertAdoptedRequirements(db, ctx, input.requirementIds);
  const owner = input.ownerId ? await assertMember(db, ctx.org.id, input.ownerId) : null;
  const today = todayInTimeZone(ctx.org.timezone);

  try {
    return await withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
      const control = await tx.control.create({
        data: {
          organizationId: ctx.org.id,
          code: input.code,
          name: input.name,
          description: input.description,
          domain: input.domain,
          priority: input.priority,
          reviewFrequency: input.reviewFrequency,
          ownerId: owner?.id ?? null,
          nextReviewDate: fromDateOnly(computeNextReviewDate(today, input.reviewFrequency)),
          createdById: ctx.user.id,
          requirements: {
            create: requirements.map((r) => ({ requirementId: r.id })),
          },
        },
      });
      await audit.record({
        action: "control.created",
        resourceType: "control",
        resourceId: control.id,
        resourceLabel: control.code,
        metadata: { source: "custom", name: control.name, requirementCodes: requirements.map((r) => r.code), ownerId: owner?.id ?? null },
      });
      if (owner) {
        await notify({
          type: "CONTROL_ASSIGNED",
          organizationId: ctx.org.id,
          recipientId: owner.id,
          payload: { orgSlug: ctx.org.slug, controlId: control.id, controlCode: control.code, controlName: control.name, actorName: ctx.user.name },
        });
      }
      return control;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ValidationError("A control with this code already exists.", { code: ["This code is already used."] });
    throw error;
  }
}

export async function updateControlDefinition(ctx: OrgContext, controlId: unknown, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(updateControlDefinitionSchema, raw);
  const before = await loadControl(db, ctx, controlId);
  if (before.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const { version, ...data } = input;
  const changes = diffFields(before, data, ["code", "name", "description", "domain", "priority", "reviewFrequency"]);
  if (!hasChanges(changes)) return;
  try {
    await withAuditedTransaction(ctx, async ({ tx, audit }) => {
      await updateVersioned(tx, ctx, before.id, version, data);
      await audit.record({ action: "control.updated", resourceType: "control", resourceId: before.id, resourceLabel: data.code, changes });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ValidationError("A control with this code already exists.", { code: ["This code is already used."] });
    throw error;
  }
}

export async function updateControlStatus(ctx: OrgContext, controlId: unknown, raw: unknown) {
  const before = await loadControl(db, ctx, controlId);
  assertCan(ctx, "control.updateStatus", { ownerId: before.ownerId });
  const input = parseInput(updateControlStatusSchema, raw);
  if (before.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const data = {
    status: input.status,
    notApplicableReason: input.status === "NOT_APPLICABLE" ? input.notApplicableReason : null,
  };
  const changes = diffFields(before, data, ["status", "notApplicableReason"]);
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await updateVersioned(tx, ctx, before.id, input.version, data);
    await audit.record({ action: "control.status_changed", resourceType: "control", resourceId: before.id, resourceLabel: before.code, changes });
  });
}

export async function updateControlNotes(ctx: OrgContext, controlId: unknown, raw: unknown) {
  const before = await loadControl(db, ctx, controlId);
  assertCan(ctx, "control.updateStatus", { ownerId: before.ownerId });
  const input = parseInput(updateControlNotesSchema, raw);
  if (before.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const data = { implementationNotes: input.implementationNotes, notes: input.notes };
  const changes = diffFields(before, data, ["implementationNotes", "notes"]);
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await updateVersioned(tx, ctx, before.id, input.version, data);
    await audit.record({ action: "control.updated", resourceType: "control", resourceId: before.id, resourceLabel: before.code, changes });
  });
}

export async function setNextReviewDate(ctx: OrgContext, controlId: unknown, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(setNextReviewDateSchema, raw);
  const before = await loadControl(db, ctx, controlId);
  if (before.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const data = { nextReviewDate: fromDateOnlyOrNull(input.nextReviewDate) };
  const changes = diffFields(before, data, ["nextReviewDate"], { dateOnly: ["nextReviewDate"] });
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await updateVersioned(tx, ctx, before.id, input.version, data);
    await audit.record({ action: "control.updated", resourceType: "control", resourceId: before.id, resourceLabel: before.code, changes });
  });
}

async function applyOwnerChange(
  ctx: OrgContext,
  helpers: Parameters<Parameters<typeof withAuditedTransaction>[1]>[0],
  control: { id: string; code: string; name: string; ownerId: string | null },
  owner: { id: string; name: string } | null,
  version: number | undefined,
  correlationId?: string,
) {
  const { tx, audit, notify } = helpers;
  if (version !== undefined) await updateVersioned(tx, ctx, control.id, version, { ownerId: owner?.id ?? null });
  else {
    const res = await tx.control.updateMany({
      where: { id: control.id, organizationId: ctx.org.id, archivedAt: null },
      data: { ownerId: owner?.id ?? null, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ConflictError(ARCHIVED_MESSAGE);
  }
  const previous = control.ownerId
    ? await tx.user.findUnique({ where: { id: control.ownerId }, select: { name: true } })
    : null;
  await audit.record({
    action: "control.owner_changed",
    resourceType: "control",
    resourceId: control.id,
    resourceLabel: control.code,
    changes: { ownerId: { from: control.ownerId, to: owner?.id ?? null } },
    metadata: { fromName: previous?.name ?? null, toName: owner?.name ?? null, ...(correlationId ? { correlationId } : {}) },
  });
  if (owner) {
    await notify({
      type: "CONTROL_ASSIGNED",
      organizationId: ctx.org.id,
      recipientId: owner.id,
      payload: { orgSlug: ctx.org.slug, controlId: control.id, controlCode: control.code, controlName: control.name, actorName: ctx.user.name },
    });
  }
}

export async function assignControlOwner(ctx: OrgContext, controlId: unknown, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(assignOwnerSchema, raw);
  const control = await loadControl(db, ctx, controlId);
  if (control.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  if (control.ownerId === input.ownerId) return;
  const owner = input.ownerId ? await assertMember(db, ctx.org.id, input.ownerId) : null;
  await withAuditedTransaction(ctx, (helpers) => applyOwnerChange(ctx, helpers, control, owner, input.version));
}

export async function bulkAssignOwner(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(bulkAssignSchema, raw);
  const owner = input.ownerId ? await assertMember(db, ctx.org.id, input.ownerId) : null;
  const controls = await db.control.findMany({
    where: { organizationId: ctx.org.id, id: { in: input.controlIds } },
    orderBy: { code: "asc" },
  });
  if (controls.length !== new Set(input.controlIds).size) throw new NotFoundError("Control not found.");
  if (controls.some((c) => c.archivedAt)) throw new ConflictError("Archived controls cannot be changed. Restore them first.");
  const targets = controls.filter((c) => c.ownerId !== (owner?.id ?? null));
  if (targets.length === 0) return { updated: 0 };
  const correlationId = randomUUID();
  await withAuditedTransaction(ctx, async (helpers) => {
    for (const c of targets) await applyOwnerChange(ctx, helpers, c, owner, undefined, correlationId);
  });
  return { updated: targets.length };
}

export async function bulkChangeStatus(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "control.manage");
  const input = parseInput(bulkStatusSchema, raw);
  const controls = await db.control.findMany({
    where: { organizationId: ctx.org.id, id: { in: input.controlIds } },
    orderBy: { code: "asc" },
  });
  if (controls.length !== new Set(input.controlIds).size) throw new NotFoundError("Control not found.");
  if (controls.some((c) => c.archivedAt)) throw new ConflictError("Archived controls cannot be changed. Restore them first.");
  const data = {
    status: input.status,
    notApplicableReason: input.status === "NOT_APPLICABLE" ? input.notApplicableReason : null,
  };
  const targets = controls
    .map((c) => ({ c, changes: diffFields(c, data, ["status", "notApplicableReason"]) }))
    .filter((t) => hasChanges(t.changes));
  if (targets.length === 0) return { updated: 0 };
  const correlationId = randomUUID();
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    for (const { c, changes } of targets) {
      await tx.control.updateMany({ where: { id: c.id, organizationId: ctx.org.id }, data: { ...data, version: { increment: 1 } } });
      await audit.record({
        action: "control.status_changed",
        resourceType: "control",
        resourceId: c.id,
        resourceLabel: c.code,
        changes,
        metadata: { correlationId },
      });
    }
  });
  return { updated: targets.length };
}

export async function archiveControl(ctx: OrgContext, controlId: unknown) {
  assertCan(ctx, "control.manage");
  const control = await loadControl(db, ctx, controlId);
  if (control.archivedAt) throw new ConflictError("This control is already archived.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.control.updateMany({ where: { id: control.id, organizationId: ctx.org.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    await audit.record({ action: "control.archived", resourceType: "control", resourceId: control.id, resourceLabel: control.code });
  });
}

export async function restoreControl(ctx: OrgContext, controlId: unknown) {
  assertCan(ctx, "control.manage");
  const control = await loadControl(db, ctx, controlId);
  if (!control.archivedAt) throw new ConflictError("This control is not archived.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.control.updateMany({ where: { id: control.id, organizationId: ctx.org.id }, data: { archivedAt: null, version: { increment: 1 } } });
    await audit.record({ action: "control.restored", resourceType: "control", resourceId: control.id, resourceLabel: control.code });
  });
}

export async function recordControlReview(ctx: OrgContext, controlId: unknown, raw: unknown) {
  const control = await loadControl(db, ctx, controlId);
  assertCan(ctx, "control.review", { ownerId: control.ownerId });
  const input = parseInput(recordReviewSchema, raw);
  if (control.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const today = todayInTimeZone(ctx.org.timezone);
  const next = input.nextReviewDate ?? computeNextReviewDate(today, control.reviewFrequency);
  if (next <= today) {
    throw new ValidationError("The next review must be in the future.", { nextReviewDate: ["Choose a date after today."] });
  }
  return withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const now = new Date();
    const review = await tx.controlReview.create({
      data: {
        organizationId: ctx.org.id,
        controlId: control.id,
        reviewerId: ctx.user.id,
        reviewedAt: now,
        outcome: input.outcome,
        notes: input.notes,
        nextReviewDate: fromDateOnly(next),
      },
    });
    await tx.control.updateMany({
      where: { id: control.id, organizationId: ctx.org.id },
      data: { lastReviewedAt: now, nextReviewDate: fromDateOnly(next), version: { increment: 1 } },
    });
    await audit.record({
      action: "control.reviewed",
      resourceType: "control",
      resourceId: control.id,
      resourceLabel: control.code,
      changes: { nextReviewDate: { from: toDateOnlyOrNull(control.nextReviewDate), to: next } },
      metadata: { reviewId: review.id, outcome: input.outcome },
    });
    return review;
  });
}

export async function mapRequirement(ctx: OrgContext, controlId: unknown, requirementId: unknown) {
  assertCan(ctx, "control.manage");
  const control = await loadControl(db, ctx, controlId);
  if (control.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  assertUuid(requirementId, "Requirement");
  const [requirement] = await assertAdoptedRequirements(db, ctx, [requirementId]);
  const existing = await db.controlRequirement.findUnique({
    where: { controlId_requirementId: { controlId: control.id, requirementId: requirement!.id } },
  });
  if (existing) throw new ConflictError(`${control.code} is already mapped to ${requirement!.code}.`);
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.controlRequirement.create({ data: { organizationId: ctx.org.id, controlId: control.id, requirementId: requirement!.id } });
    await audit.record({
      action: "control.requirement_mapped",
      resourceType: "control",
      resourceId: control.id,
      resourceLabel: control.code,
      metadata: { requirementId: requirement!.id, requirementCode: requirement!.code },
    });
  });
}

export async function unmapRequirement(ctx: OrgContext, controlId: unknown, requirementId: unknown) {
  assertCan(ctx, "control.manage");
  const control = await loadControl(db, ctx, controlId);
  if (control.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  assertUuid(requirementId, "Requirement");
  const mapping = await db.controlRequirement.findFirst({
    where: { organizationId: ctx.org.id, controlId: control.id, requirementId },
    select: { id: true, requirement: { select: { code: true } } },
  });
  if (!mapping) throw new NotFoundError("Mapping not found.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.controlRequirement.deleteMany({ where: { id: mapping.id, organizationId: ctx.org.id } });
    await audit.record({
      action: "control.requirement_unmapped",
      resourceType: "control",
      resourceId: control.id,
      resourceLabel: control.code,
      metadata: { requirementId, requirementCode: mapping.requirement.code },
    });
  });
}

export async function createEvidenceRequirement(ctx: OrgContext, controlId: unknown, raw: unknown) {
  assertCan(ctx, "control.manage");
  const control = await loadControl(db, ctx, controlId);
  if (control.archivedAt) throw new ConflictError(ARCHIVED_MESSAGE);
  const input = parseInput(evidenceRequirementSchema, raw);
  return withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const count = await tx.evidenceRequirement.count({ where: { organizationId: ctx.org.id, controlId: control.id } });
    const req = await tx.evidenceRequirement.create({
      data: { organizationId: ctx.org.id, controlId: control.id, ...input, sortOrder: count },
    });
    await audit.record({
      action: "evidence_requirement.created",
      resourceType: "evidence_requirement",
      resourceId: req.id,
      resourceLabel: req.title,
      metadata: { controlId: control.id, controlCode: control.code, freshnessDays: req.freshnessDays, isRequired: req.isRequired },
    });
    return req;
  });
}

async function loadEvidenceRequirement(ctx: OrgContext, requirementId: unknown) {
  assertUuid(requirementId, "Evidence requirement");
  const req = await db.evidenceRequirement.findFirst({
    where: { id: requirementId, organizationId: ctx.org.id },
    include: { control: { select: { id: true, code: true, archivedAt: true } } },
  });
  if (!req) throw new NotFoundError("Evidence requirement not found.");
  return req;
}

export async function updateEvidenceRequirement(ctx: OrgContext, requirementId: unknown, raw: unknown) {
  assertCan(ctx, "control.manage");
  const before = await loadEvidenceRequirement(ctx, requirementId);
  if (before.archivedAt || before.control.archivedAt) throw new ConflictError("Archived items cannot be changed.");
  const input = parseInput(evidenceRequirementSchema, raw);
  const changes = diffFields(before, input, ["title", "description", "freshnessDays", "isRequired"]);
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.evidenceRequirement.updateMany({ where: { id: before.id, organizationId: ctx.org.id }, data: input });
    await audit.record({
      action: "evidence_requirement.updated",
      resourceType: "evidence_requirement",
      resourceId: before.id,
      resourceLabel: input.title,
      changes,
      metadata: { controlId: before.control.id, controlCode: before.control.code },
    });
  });
}

export async function archiveEvidenceRequirement(ctx: OrgContext, requirementId: unknown) {
  assertCan(ctx, "control.manage");
  const req = await loadEvidenceRequirement(ctx, requirementId);
  if (req.archivedAt) throw new ConflictError("This evidence requirement is already archived.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.evidenceRequirement.updateMany({ where: { id: req.id, organizationId: ctx.org.id }, data: { archivedAt: new Date() } });
    await audit.record({
      action: "evidence_requirement.archived",
      resourceType: "evidence_requirement",
      resourceId: req.id,
      resourceLabel: req.title,
      metadata: { controlId: req.control.id, controlCode: req.control.code },
    });
  });
}
