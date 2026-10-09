import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { can, denialReason } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { isUuid } from "@/server/ids";
import { addDays, fromDateOnly, todayInTimeZone, toDateOnlyOrNull } from "@/lib/dates";
import { freshnessOf, inScopeRequirementIds, isApplicable } from "@/features/readiness/engine";
import { loadComplianceSnapshot } from "@/features/readiness/server/snapshot";
import { listResourceActivity } from "@/features/audit/server/service";
import type { EvidenceListQuery } from "../schemas";

export const EVIDENCE_PAGE_SIZE = 50;

export async function listEvidence(ctx: OrgContext, q: EvidenceListQuery) {
  const today = todayInTimeZone(ctx.org.timezone);
  const soon = fromDateOnly(addDays(today, 30));
  const todayDate = fromDateOnly(today);
  const where: Prisma.EvidenceWhereInput = { organizationId: ctx.org.id, deletedAt: null };
  const and: Prisma.EvidenceWhereInput[] = [];

  if (q.tab === "review") where.status = "PENDING_REVIEW";
  if (q.tab === "expiring") {
    where.status = "APPROVED";
    where.validUntil = { not: null, lte: soon };
  }
  if (q.status) where.status = q.status;
  if (q.category) where.category = q.category;
  if (q.uploader === "me") where.uploadedById = ctx.user.id;
  else if (q.uploader) where.uploadedById = q.uploader;
  if (q.control)
    where.controlLinks = { some: { controlId: q.control, organizationId: ctx.org.id } };
  if (q.q)
    and.push({
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { description: { contains: q.q, mode: "insensitive" } },
      ],
    });
  if (q.freshness === "EXPIRED") and.push({ validUntil: { lt: todayDate } });
  if (q.freshness === "EXPIRING_SOON") and.push({ validUntil: { gte: todayDate, lte: soon } });
  if (q.freshness === "CURRENT") and.push({ validUntil: { gt: soon } });
  if (q.freshness === "NO_EXPIRY") and.push({ validUntil: null });
  if (and.length) where.AND = and;

  const total = await db.evidence.count({ where });
  const page = Math.min(q.page ?? 1, Math.max(1, Math.ceil(total / EVIDENCE_PAGE_SIZE)));
  const rows = await db.evidence.findMany({
    where,
    orderBy:
      q.tab === "expiring"
        ? [{ validUntil: "asc" }]
        : q.tab === "review"
          ? [{ updatedAt: "asc" }]
          : [{ updatedAt: "desc" }],
    skip: (page - 1) * EVIDENCE_PAGE_SIZE,
    take: EVIDENCE_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      kind: true,
      category: true,
      status: true,
      collectedAt: true,
      validUntil: true,
      updatedAt: true,
      uploadedBy: { select: { name: true } },
      currentVersion: { select: { originalFilename: true, sizeBytes: true, versionNumber: true } },
      controlLinks: { select: { control: { select: { id: true, code: true } } } },
    },
  });
  return {
    today,
    total,
    page,
    pageSize: EVIDENCE_PAGE_SIZE,
    rows: rows.map((e) => {
      const validUntil = toDateOnlyOrNull(e.validUntil);
      return {
        ...e,
        collectedAt: toDateOnlyOrNull(e.collectedAt)!,
        validUntil,
        freshness: freshnessOf(validUntil, today),
        controls: [...new Map(e.controlLinks.map((l) => [l.control.id, l.control])).values()],
      };
    }),
  };
}

/** Every unsatisfied required evidence requirement across applicable controls (collection to-do list). */
export async function listMissingEvidence(ctx: OrgContext) {
  const snap = await loadComplianceSnapshot(ctx);
  const inScopeSets = snap.frameworks.map((f) => inScopeRequirementIds(f));
  const rows: {
    controlId: string;
    controlCode: string;
    controlName: string;
    ownerName: string | null;
    priority: string;
    requirementId: string;
    requirementTitle: string;
    state: string;
    freshnessDays: number;
  }[] = [];
  for (const c of snap.controls) {
    if (!inScopeSets.some((s) => isApplicable(c, s))) continue;
    const e = snap.evaluations.get(c.id)!;
    for (const r of c.evidenceRequirements) {
      if (r.archived || !r.isRequired) continue;
      const ev = e.requirements.get(r.id);
      if (!ev || ev.satisfied) continue;
      rows.push({
        controlId: c.id,
        controlCode: c.code,
        controlName: c.name,
        ownerName: c.ownerName,
        priority: c.priority,
        requirementId: r.id,
        requirementTitle: r.title,
        state: ev.state,
        freshnessDays: r.freshnessDays,
      });
    }
  }
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
  rows.sort(
    (a, b) =>
      (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) ||
      a.controlCode.localeCompare(b.controlCode, undefined, { numeric: true }),
  );
  return { rows, today: snap.today };
}

export async function getEvidenceDetail(ctx: OrgContext, evidenceId: string) {
  if (!isUuid(evidenceId)) throw new NotFoundError("Evidence not found.");
  const e = await db.evidence.findFirst({
    where: { id: evidenceId, organizationId: ctx.org.id, deletedAt: null },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      currentVersion: { include: { uploadedBy: { select: { id: true, name: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      controlLinks: {
        include: {
          control: { select: { id: true, code: true, name: true, archivedAt: true } },
          evidenceRequirement: { select: { id: true, title: true, freshnessDays: true } },
        },
      },
    },
  });
  if (!e) throw new NotFoundError("Evidence not found.");
  const today = todayInTimeZone(ctx.org.timezone);
  const validUntil = toDateOnlyOrNull(e.validUntil);
  const versionUploadedById = e.currentVersion?.uploadedById ?? e.uploadedById;
  const [activity, controls] = await Promise.all([
    listResourceActivity(ctx, "evidence", e.id, 50),
    db.control.findMany({
      where: { organizationId: ctx.org.id, archivedAt: null },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        evidenceRequirements: { where: { archivedAt: null }, select: { id: true, title: true } },
      },
    }),
  ]);
  return {
    evidence: { ...e, collectedAt: toDateOnlyOrNull(e.collectedAt)!, validUntil },
    today,
    freshness: freshnessOf(validUntil, today),
    previewImage: e.currentVersion?.mimeType.startsWith("image/") ?? false,
    activity,
    controls,
    permissions: {
      edit: can(ctx, "evidence.editMetadata", { uploadedById: e.uploadedById, status: e.status }),
      editReason: denialReason(ctx, "evidence.editMetadata", {
        uploadedById: e.uploadedById,
        status: e.status,
      }),
      review: can(ctx, "evidence.review", { versionUploadedById }) && e.status === "PENDING_REVIEW",
      reviewReason:
        e.status !== "PENDING_REVIEW"
          ? null
          : denialReason(ctx, "evidence.review", { versionUploadedById }),
      contribute: can(ctx, "evidence.contribute"),
      isManager: can(ctx, "evidence.review", { versionUploadedById: null }),
    },
  };
}
export type EvidenceDetail = Awaited<ReturnType<typeof getEvidenceDetail>>;

/** Controls and requirements for the upload form's link picker. */
export async function listLinkTargets(ctx: OrgContext) {
  return db.control.findMany({
    where: { organizationId: ctx.org.id, archivedAt: null },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      evidenceRequirements: {
        where: { archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true },
      },
    },
  });
}

/** Counts and options for the evidence library's tabs and filters. */
export async function getEvidenceFilterOptions(ctx: OrgContext) {
  const [pendingCount, controls] = await Promise.all([
    db.evidence.count({
      where: { organizationId: ctx.org.id, deletedAt: null, status: "PENDING_REVIEW" },
    }),
    db.control.findMany({
      where: { organizationId: ctx.org.id, archivedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true },
    }),
  ]);
  return { pendingCount, controls };
}
