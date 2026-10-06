import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction, type AuditedTransactionHelpers } from "@/server/audit/record";
import { parseInput } from "@/server/validation";
import type { OrgContext } from "@/server/context";
import { uuidv7 } from "@/server/ids";
import { fromDateOnly, todayInTimeZone } from "@/lib/dates";
import { computeNextReviewDate } from "@/features/readiness/engine";
import { adoptFrameworkSchema, frameworkScopeSchema } from "@/features/organizations/schemas";

/** Active frameworks with their top-level categories (for onboarding and settings). */
export async function listCatalogFrameworks() {
  return db.framework.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      shortName: true,
      description: true,
      requirementLabel: true,
      requirements: {
        where: { parentId: null, kind: "GROUP" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, title: true, summary: true, isScopeRequired: true },
      },
      _count: { select: { controlTemplates: true } },
    },
  });
}

async function resolveScope(frameworkId: string, scopeCodes: readonly string[]) {
  const categories = await db.frameworkRequirement.findMany({
    where: { frameworkId, parentId: null, kind: "GROUP" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, isScopeRequired: true },
  });
  const byCode = new Map(categories.map((c) => [c.code, c]));
  for (const code of scopeCodes) {
    if (!byCode.has(code)) throw new ValidationError("Unknown scope category.", { scopeCodes: [`Unknown category ${code}.`] });
  }
  const selected = new Set(scopeCodes);
  for (const c of categories) if (c.isScopeRequired) selected.add(c.code);
  return categories.filter((c) => selected.has(c.code));
}

export type AdoptionResult = {
  organizationFrameworkId: string;
  newlyAdopted: boolean;
  controlsCreated: number;
  evidenceRequirementsCreated: number;
};

/**
 * Adopts a framework inside an existing audited transaction. Idempotent: the organization
 * framework row is created once, and template-derived controls are never duplicated (also
 * enforced by the unique (organizationId, templateId) index).
 */
export async function adoptFrameworkInTransaction(
  ctx: OrgContext,
  { tx, audit }: AuditedTransactionHelpers,
  input: { frameworkKey: string; scopeCodes: readonly string[]; starter: boolean },
): Promise<AdoptionResult> {
  assertCan(ctx, "framework.manage");
  const framework = await tx.framework.findFirst({ where: { key: input.frameworkKey, isActive: true }, select: { id: true, name: true } });
  if (!framework) throw new NotFoundError("Framework not found.");
  const scope = await resolveScope(framework.id, input.scopeCodes);

  let orgFramework = await tx.organizationFramework.findUnique({
    where: { organizationId_frameworkId: { organizationId: ctx.org.id, frameworkId: framework.id } },
    select: { id: true },
  });
  const newlyAdopted = !orgFramework;
  if (!orgFramework) {
    orgFramework = await tx.organizationFramework.create({
      data: {
        organizationId: ctx.org.id,
        frameworkId: framework.id,
        adoptedById: ctx.user.id,
        scopes: { create: scope.map((s) => ({ requirementId: s.id })) },
      },
      select: { id: true },
    });
  }

  let controlsCreated = 0;
  let evidenceRequirementsCreated = 0;
  const correlationId = randomUUID();

  if (input.starter) {
    const templates = await tx.controlTemplate.findMany({
      where: { frameworkId: framework.id },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        guidance: true,
        domain: true,
        defaultPriority: true,
        defaultReviewFrequency: true,
        requirements: { select: { requirementId: true } },
        evidenceRequirements: { orderBy: { sortOrder: "asc" } },
      },
    });
    const existing = await tx.control.findMany({
      where: { organizationId: ctx.org.id },
      select: { code: true, templateId: true },
    });
    const usedTemplates = new Set(existing.map((c) => c.templateId).filter(Boolean));
    const usedCodes = new Set(existing.map((c) => c.code));
    const today = todayInTimeZone(ctx.org.timezone);
    const skippedCodeConflicts: string[] = [];

    const controls: { id: string; code: string; name: string; template: (typeof templates)[number] }[] = [];
    for (const t of templates) {
      if (usedTemplates.has(t.id)) continue;
      if (usedCodes.has(t.code)) {
        skippedCodeConflicts.push(t.code);
        continue;
      }
      controls.push({ id: uuidv7(), code: t.code, name: t.name, template: t });
    }

    if (controls.length > 0) {
      await tx.control.createMany({
        data: controls.map((c) => ({
          id: c.id,
          organizationId: ctx.org.id,
          code: c.code,
          name: c.name,
          description: c.template.description,
          implementationNotes: c.template.guidance,
          domain: c.template.domain,
          priority: c.template.defaultPriority,
          reviewFrequency: c.template.defaultReviewFrequency,
          nextReviewDate: fromDateOnly(computeNextReviewDate(today, c.template.defaultReviewFrequency)),
          templateId: c.template.id,
          createdById: ctx.user.id,
        })),
      });
      await tx.controlRequirement.createMany({
        data: controls.flatMap((c) =>
          c.template.requirements.map((r) => ({ organizationId: ctx.org.id, controlId: c.id, requirementId: r.requirementId })),
        ),
      });
      const evidenceRows = controls.flatMap((c) =>
        c.template.evidenceRequirements.map((e) => ({
          organizationId: ctx.org.id,
          controlId: c.id,
          title: e.title,
          description: e.description,
          freshnessDays: e.freshnessDays,
          isRequired: e.isRequired,
          templateId: e.id,
          sortOrder: e.sortOrder,
        })),
      );
      await tx.evidenceRequirement.createMany({ data: evidenceRows });
      controlsCreated = controls.length;
      evidenceRequirementsCreated = evidenceRows.length;

      for (const c of controls) {
        await audit.record({
          action: "control.created",
          resourceType: "control",
          resourceId: c.id,
          resourceLabel: c.code,
          metadata: { correlationId, source: "template", templateCode: c.template.code, name: c.name },
        });
      }
    }

    if (newlyAdopted || controlsCreated > 0) {
      await audit.record({
        action: "framework.adopted",
        resourceType: "framework",
        resourceId: framework.id,
        resourceLabel: framework.name,
        metadata: {
          correlationId,
          scope: scope.map((s) => s.code),
          starter: true,
          controlsCreated,
          evidenceRequirementsCreated,
          ...(skippedCodeConflicts.length ? { skippedCodeConflicts } : {}),
        },
      });
    }
  } else if (newlyAdopted) {
    await audit.record({
      action: "framework.adopted",
      resourceType: "framework",
      resourceId: framework.id,
      resourceLabel: framework.name,
      metadata: { correlationId, scope: scope.map((s) => s.code), starter: false, controlsCreated: 0, evidenceRequirementsCreated: 0 },
    });
  }

  return { organizationFrameworkId: orgFramework.id, newlyAdopted, controlsCreated, evidenceRequirementsCreated };
}

export async function adoptFramework(ctx: OrgContext, raw: unknown): Promise<AdoptionResult> {
  assertCan(ctx, "framework.manage");
  const input = parseInput(adoptFrameworkSchema, raw);
  return withAuditedTransaction(ctx, (helpers) => adoptFrameworkInTransaction(ctx, helpers, input), { timeoutMs: 60_000 });
}

/** Changes in-scope categories. Never deletes controls; out-of-scope mappings stop counting. */
export async function updateFrameworkScope(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "framework.manage");
  const input = parseInput(frameworkScopeSchema, raw);
  const orgFramework = await db.organizationFramework.findFirst({
    where: { organizationId: ctx.org.id, framework: { key: input.frameworkKey } },
    select: {
      id: true,
      framework: { select: { id: true, name: true } },
      scopes: { select: { requirement: { select: { code: true } } } },
    },
  });
  if (!orgFramework) throw new NotFoundError("Framework not adopted.");
  const scope = await resolveScope(orgFramework.framework.id, input.scopeCodes);
  const before = orgFramework.scopes.map((s) => s.requirement.code).sort();
  const after = scope.map((s) => s.code).sort();
  if (before.join(",") === after.join(",")) return;

  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.organizationFrameworkScope.deleteMany({ where: { organizationFrameworkId: orgFramework.id } });
    await tx.organizationFrameworkScope.createMany({
      data: scope.map((s) => ({ organizationFrameworkId: orgFramework.id, requirementId: s.id })),
    });
    await audit.record({
      action: "framework.scope_updated",
      resourceType: "framework",
      resourceId: orgFramework.framework.id,
      resourceLabel: orgFramework.framework.name,
      changes: { scope: { from: before, to: after } },
    });
  });
}
