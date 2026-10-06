import "server-only";
import { db } from "@/server/db";
import { NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction, type AuditScope } from "@/server/audit/record";
import { diffFields, hasChanges } from "@/server/audit/diff";
import { parseInput } from "@/server/validation";
import type { OrgContext, UserContext } from "@/server/context";
import { uuidv7 } from "@/server/ids";
import { fromDateOnlyOrNull } from "@/lib/dates";
import {
  createOrganizationSchema,
  evidencePolicySchema,
  slugSchema,
  updateOrganizationSchema,
} from "../schemas";
import { adoptFrameworkInTransaction } from "@/features/frameworks/server/service";

export async function isSlugAvailable(slug: string): Promise<{ available: boolean; reason?: string }> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message };
  const existing = await db.organization.findUnique({ where: { slug: parsed.data }, select: { id: true } });
  return existing ? { available: false, reason: "This URL is already taken." } : { available: true };
}

/**
 * Creates an organization with the creator as Owner, and adopts the chosen framework (optionally
 * with the starter control set), all in one audited transaction.
 */
/** `isDemo` is set only by the demo seed; it is never accepted from user input. */
export async function createOrganization(userCtx: UserContext, raw: unknown, options: { isDemo?: boolean } = {}) {
  const input = parseInput(createOrganizationSchema, raw);
  const existing = await db.organization.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (existing) throw new ValidationError("This URL is already taken.", { slug: ["This URL is already taken."] });

  const orgId = uuidv7();
  const scope: AuditScope = {
    actor: { type: "USER", user: userCtx.user, role: "OWNER" },
    request: userCtx.request,
    organizationId: orgId,
    auditMetadata: userCtx.auditMetadata,
  };

  try {
    return await withAuditedTransaction(
      scope,
      async (helpers) => {
        const { tx, audit } = helpers;
        const org = await tx.organization.create({
          data: {
            id: orgId,
            name: input.name,
            slug: input.slug,
            industry: input.industry,
            employeeRange: input.employeeRange,
            description: input.description,
            timezone: input.timezone,
            auditType: input.auditType,
            targetAuditDate: fromDateOnlyOrNull(input.targetAuditDate),
            observationStart: fromDateOnlyOrNull(input.observationStart),
            observationEnd: fromDateOnlyOrNull(input.observationEnd),
            isDemo: options.isDemo ?? false,
          },
        });
        const membership = await tx.organizationMember.create({
          data: { organizationId: org.id, userId: userCtx.user.id, role: "OWNER" },
        });
        await audit.record({
          action: "organization.created",
          resourceType: "organization",
          resourceId: org.id,
          resourceLabel: org.name,
          metadata: { slug: org.slug, ...(org.isDemo ? { isDemo: true } : {}) },
        });

        const ctx: OrgContext = {
          user: userCtx.user,
          org: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            timezone: org.timezone,
            requireIndependentEvidenceReview: org.requireIndependentEvidenceReview,
            defaultEvidenceValidityDays: org.defaultEvidenceValidityDays,
            isDemo: org.isDemo,
          },
          membership: { id: membership.id, role: "OWNER", title: null },
          role: "OWNER",
          request: userCtx.request,
          sessionId: userCtx.sessionId,
          auditMetadata: userCtx.auditMetadata,
        };
        const adoption = await adoptFrameworkInTransaction(ctx, helpers, {
          frameworkKey: input.frameworkKey,
          scopeCodes: input.scopeCodes,
          starter: input.starter,
        });
        return { org, adoption };
      },
      { timeoutMs: 60_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new ValidationError("This URL is already taken.", { slug: ["This URL is already taken."] });
    throw error;
  }
}

const PROFILE_FIELDS = [
  "name",
  "legalName",
  "website",
  "industry",
  "employeeRange",
  "description",
  "timezone",
  "auditType",
  "targetAuditDate",
  "observationStart",
  "observationEnd",
] as const;

export async function updateOrganizationProfile(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "org.updateSettings");
  const input = parseInput(updateOrganizationSchema, raw);
  const before = await db.organization.findUnique({ where: { id: ctx.org.id } });
  if (!before) throw new NotFoundError();
  const data = {
    name: input.name,
    legalName: input.legalName,
    website: input.website,
    industry: input.industry,
    employeeRange: input.employeeRange,
    description: input.description,
    timezone: input.timezone,
    auditType: input.auditType,
    targetAuditDate: fromDateOnlyOrNull(input.targetAuditDate),
    observationStart: fromDateOnlyOrNull(input.observationStart),
    observationEnd: fromDateOnlyOrNull(input.observationEnd),
  };
  const changes = diffFields(before, data, PROFILE_FIELDS, { dateOnly: ["targetAuditDate", "observationStart", "observationEnd"] });
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.organization.update({ where: { id: ctx.org.id }, data });
    await audit.record({ action: "organization.updated", resourceType: "organization", resourceId: ctx.org.id, resourceLabel: data.name, changes });
  });
}

export async function updateEvidencePolicy(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "org.updateSettings");
  const input = parseInput(evidencePolicySchema, raw);
  const before = await db.organization.findUnique({ where: { id: ctx.org.id } });
  if (!before) throw new NotFoundError();
  const changes = diffFields(before, input, ["requireIndependentEvidenceReview", "defaultEvidenceValidityDays"]);
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.organization.update({ where: { id: ctx.org.id }, data: input });
    await audit.record({
      action: "organization.settings_updated",
      resourceType: "organization",
      resourceId: ctx.org.id,
      resourceLabel: before.name,
      changes,
    });
  });
}

export async function getOrganization(ctx: OrgContext) {
  const org = await db.organization.findUnique({ where: { id: ctx.org.id } });
  if (!org) throw new NotFoundError();
  return org;
}

/** Organizations the user belongs to (for the switcher and org picker). */
export async function listMyOrganizations(userId: string) {
  const rows = await db.organizationMember.findMany({
    where: { userId },
    orderBy: { organization: { name: "asc" } },
    select: { role: true, organization: { select: { id: true, name: true, slug: true, isDemo: true } } },
  });
  return rows.map((r) => ({ ...r.organization, role: r.role }));
}
