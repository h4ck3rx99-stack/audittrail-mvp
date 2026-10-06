import "server-only";
import { db } from "@/server/db";
import { can } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { addDays, toDateOnly, toDateOnlyOrNull } from "@/lib/dates";
import { loadGaps } from "@/features/readiness/server/snapshot";
import { listRecentActivity } from "@/features/audit/server/service";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { isApplicable, inScopeRequirementIds } from "@/features/readiness/engine";

/** Everything the dashboard renders, computed from real data in a fixed number of queries. */
export async function getDashboard(ctx: OrgContext, frameworkKey?: string) {
  const { snapshot, gaps } = await loadGaps(ctx);
  const framework = snapshot.frameworks.find((f) => f.key === frameworkKey) ?? snapshot.frameworks[0] ?? null;
  const readiness = framework ? snapshot.readiness.find((r) => r.frameworkId === framework.id) ?? null : null;
  const today = snapshot.today;
  const isManager = can(ctx, "evidence.review", { versionUploadedById: null });

  const inScopeSets = snapshot.frameworks.map((f) => inScopeRequirementIds(f));
  const applicable = snapshot.controls.filter((c) => inScopeSets.some((s) => isApplicable(c, s)));
  const reviewsOverdue = applicable.filter((c) => snapshot.evaluations.get(c.id)?.reviewOverdue).length;

  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const [org, openTasks, overdueTasks, risksBySeverity, myTasks, awaitingReview, myRejected, memberCount, invitationCount, linkCount, approvedCount, reviewCount, activity] =
    await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { name: true, auditType: true, targetAuditDate: true, observationStart: true, observationEnd: true } }),
      db.task.count({ where: { organizationId: ctx.org.id, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } }),
      db.task.count({ where: { organizationId: ctx.org.id, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueDate: { lt: todayDate } } }),
      db.risk.groupBy({ by: ["severity"], where: { organizationId: ctx.org.id, archivedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: true }),
      db.task.findMany({
        where: { organizationId: ctx.org.id, assigneeId: ctx.user.id, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "asc" }],
        take: 6,
        select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true },
      }),
      isManager
        ? db.evidence.findMany({
            where: { organizationId: ctx.org.id, deletedAt: null, status: "PENDING_REVIEW" },
            orderBy: { updatedAt: "asc" },
            take: 6,
            select: { id: true, title: true, uploadedBy: { select: { name: true } }, currentVersion: { select: { uploadedById: true } }, uploadedById: true, updatedAt: true },
          })
        : Promise.resolve([]),
      db.evidence.findMany({
        where: { organizationId: ctx.org.id, deletedAt: null, status: "REJECTED", uploadedById: ctx.user.id },
        orderBy: { reviewedAt: "desc" },
        take: 6,
        select: { id: true, title: true, reviewComment: true },
      }),
      db.organizationMember.count({ where: { organizationId: ctx.org.id } }),
      db.invitation.count({ where: { organizationId: ctx.org.id } }),
      db.controlEvidence.count({ where: { organizationId: ctx.org.id } }),
      db.evidence.count({ where: { organizationId: ctx.org.id, status: "APPROVED" } }),
      db.controlReview.count({ where: { organizationId: ctx.org.id } }),
      listRecentActivity(ctx, { limit: 12 }),
    ]);

  const myReviews = applicable
    .filter((c) => c.ownerId === ctx.user.id && c.nextReviewDate && c.nextReviewDate <= addDays(today, 14))
    .sort((a, b) => (a.nextReviewDate ?? "").localeCompare(b.nextReviewDate ?? ""))
    .slice(0, 6)
    .map((c) => ({ id: c.id, code: c.code, name: c.name, nextReviewDate: c.nextReviewDate }));

  const unowned = applicable.filter((c) => !c.ownerId).length;
  const checklist = [
    { key: "invite", label: "Invite a teammate", done: memberCount > 1 || invitationCount > 0, href: `/org/${ctx.org.slug}/settings/members` },
    { key: "owners", label: "Assign owners to all controls", done: applicable.length > 0 && unowned === 0, href: `/org/${ctx.org.slug}/controls?owner=unassigned` },
    { key: "link", label: "Link evidence to a control", done: linkCount > 0, href: `/org/${ctx.org.slug}/evidence?tab=missing` },
    { key: "approve", label: "Approve your first evidence", done: approvedCount > 0, href: `/org/${ctx.org.slug}/evidence?tab=review` },
    { key: "review", label: "Record your first control review", done: reviewCount > 0, href: `/org/${ctx.org.slug}/controls` },
  ];

  const risks = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
  for (const r of risksBySeverity) risks[r.severity] = r._count;

  return {
    today,
    org: {
      name: org.name,
      auditType: org.auditType,
      targetAuditDate: toDateOnlyOrNull(org.targetAuditDate),
      observationStart: toDateOnlyOrNull(org.observationStart),
      observationEnd: toDateOnlyOrNull(org.observationEnd),
    },
    frameworks: snapshot.frameworks.map((f) => ({ key: f.key, name: f.name, requirementLabel: f.requirementLabel })),
    framework: framework ? { key: framework.key, name: framework.name, requirementLabel: framework.requirementLabel } : null,
    readiness,
    metrics: {
      openTasks,
      overdueTasks,
      risks,
      openRisks: Object.values(risks).reduce((a, b) => a + b, 0),
      reviewsOverdue,
    },
    gaps: gaps.slice(0, 8),
    gapCount: gaps.length,
    myWork: {
      tasks: myTasks.map((t) => ({ ...t, dueDate: toDateOnlyOrNull(t.dueDate) })),
      reviews: myReviews,
      awaitingReview: awaitingReview.map((e) => ({
        id: e.id,
        title: e.title,
        uploadedBy: e.uploadedBy.name,
        mine: (e.currentVersion?.uploadedById ?? e.uploadedById) === ctx.user.id,
        waitingSince: toDateOnly(e.updatedAt),
      })),
      rejected: myRejected,
      isManager,
    },
    activity,
    activityLinks: await resolveResourceLinks(ctx, activity),
    checklist,
    showChecklist: checklist.some((c) => !c.done),
  };
}
