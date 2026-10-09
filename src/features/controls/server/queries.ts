import "server-only";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { can, denialReason } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { isUuid } from "@/server/ids";
import { toDateOnlyOrNull } from "@/lib/dates";
import {
  freshnessOf,
  inScopeRequirementIds,
  isApplicable,
  type Health,
} from "@/features/readiness/engine";
import { loadComplianceSnapshot } from "@/features/readiness/server/snapshot";
import { listResourceActivity } from "@/features/audit/server/service";
import { listMemberOptions } from "@/features/members/server/service";
import type { ControlListQuery } from "../schemas";

export const CONTROLS_PAGE_SIZE = 50;

const STATUS_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, IMPLEMENTED: 2, NOT_APPLICABLE: 3 } as const;
const HEALTH_ORDER: Record<Health | "NA", number> = { NOT_READY: 0, ATTENTION: 1, READY: 2, NA: 3 };
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export async function listControls(ctx: OrgContext, q: ControlListQuery) {
  const snap = await loadComplianceSnapshot(ctx, { includeArchived: q.archived === "1" });
  const inScopeSets = snap.frameworks.map((f) => inScopeRequirementIds(f));

  // Requirement id → codes of itself and all ancestors (for category/series filters).
  const ancestry = new Map<string, Set<string>>();
  for (const f of snap.frameworks) {
    const byId = new Map(f.requirements.map((r) => [r.id, r]));
    for (const r of f.requirements) {
      const codes = new Set<string>();
      let cur: typeof r | undefined = r;
      let guard = 0;
      while (cur && guard++ < 20) {
        codes.add(cur.code);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      ancestry.set(r.id, codes);
    }
  }

  let rows = snap.controls.map((c) => {
    const e = snap.evaluations.get(c.id)!;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      status: c.status,
      priority: c.priority,
      ownerId: c.ownerId,
      ownerName: c.ownerName,
      archived: c.archived,
      health: (e.health ?? "NA") as Health | "NA",
      applicable: inScopeSets.some((s) => isApplicable(c, s)),
      evidence: { satisfied: e.requiredSatisfied, total: e.requiredTotal },
      nextReviewDate: c.nextReviewDate,
      reviewOverdue: e.reviewOverdue,
      criteria: c.requirementIds
        .map((id) => snap.requirementCodes.get(id)?.code)
        .filter((x): x is string => !!x)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      requirementIds: c.requirementIds,
    };
  });

  if (q.archived === "1") rows = rows.filter((r) => r.archived);
  if (q.q) {
    const needle = q.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.code.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle) ||
        r.criteria.some((c) => c.toLowerCase() === needle),
    );
  }
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  if (q.health) rows = rows.filter((r) => r.health === q.health);
  if (q.priority) rows = rows.filter((r) => r.priority === q.priority);
  if (q.owner === "me") rows = rows.filter((r) => r.ownerId === ctx.user.id);
  else if (q.owner === "unassigned") rows = rows.filter((r) => !r.ownerId);
  else if (q.owner) rows = rows.filter((r) => r.ownerId === q.owner);
  if (q.overdue === "1") rows = rows.filter((r) => r.reviewOverdue && r.applicable);
  if (q.group)
    rows = rows.filter((r) => r.requirementIds.some((id) => ancestry.get(id)?.has(q.group!)));

  const sort = q.sort ?? "code";
  const dir = q.dir ?? "asc";
  const sign = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "status":
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        break;
      case "health":
        cmp = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
        break;
      case "owner":
        cmp = (a.ownerName ?? "￿").localeCompare(b.ownerName ?? "￿");
        break;
      case "nextReview":
        cmp = (a.nextReviewDate ?? "9999").localeCompare(b.nextReviewDate ?? "9999");
        break;
      case "priority":
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case "evidence":
        cmp = a.evidence.total - a.evidence.satisfied - (b.evidence.total - b.evidence.satisfied);
        break;
      default:
        cmp = 0;
    }
    return cmp * sign || a.code.localeCompare(b.code, undefined, { numeric: true });
  });

  const total = rows.length;
  const page = Math.min(q.page ?? 1, Math.max(1, Math.ceil(total / CONTROLS_PAGE_SIZE)));
  const pageRows = rows.slice((page - 1) * CONTROLS_PAGE_SIZE, page * CONTROLS_PAGE_SIZE);

  // Filter options: categories and series of adopted frameworks.
  const groups = snap.frameworks.flatMap((f) =>
    f.requirements
      .filter((r) => r.kind === "GROUP")
      .map((r) => ({ code: r.code, title: r.title, topLevel: r.parentId === null })),
  );

  return {
    rows: pageRows,
    total,
    page,
    pageSize: CONTROLS_PAGE_SIZE,
    today: snap.today,
    groups,
    hasFramework: snap.frameworks.length > 0,
  };
}

export async function getControlDetail(ctx: OrgContext, controlId: string) {
  if (!isUuid(controlId)) throw new NotFoundError("Control not found.");
  const control = await db.control.findFirst({
    where: { id: controlId, organizationId: ctx.org.id },
    include: {
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      template: { select: { code: true, guidance: true } },
      requirements: {
        select: {
          requirement: {
            select: {
              id: true,
              code: true,
              title: true,
              summary: true,
              framework: { select: { key: true, name: true } },
            },
          },
        },
      },
      reviews: {
        orderBy: { reviewedAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
      taskLinks: {
        select: {
          task: {
            select: {
              id: true,
              number: true,
              title: true,
              status: true,
              priority: true,
              dueDate: true,
              assignee: { select: { name: true } },
            },
          },
        },
      },
      riskLinks: {
        select: {
          risk: {
            select: {
              id: true,
              number: true,
              title: true,
              status: true,
              severity: true,
              archivedAt: true,
            },
          },
        },
      },
      evidenceLinks: {
        where: { evidenceRequirementId: null },
        select: {
          id: true,
          evidence: {
            select: {
              id: true,
              title: true,
              status: true,
              validUntil: true,
              deletedAt: true,
              kind: true,
            },
          },
        },
      },
    },
  });
  if (!control) throw new NotFoundError("Control not found.");

  const snap = await loadComplianceSnapshot(ctx, { includeArchived: true });
  const input = snap.controls.find((c) => c.id === control.id)!;
  const evaluation = snap.evaluations.get(control.id)!;
  const inScopeSets = snap.frameworks.map((f) => inScopeRequirementIds(f));
  const inScopeAll = new Set(inScopeSets.flatMap((s) => [...s]));
  const applicable = inScopeSets.some((s) => isApplicable(input, s));

  const evidenceRequirements = input.evidenceRequirements
    .filter((r) => !r.archived)
    .map((r) => {
      const ev = evaluation.requirements.get(r.id)!;
      return {
        id: r.id,
        title: r.title,
        isRequired: r.isRequired,
        freshnessDays: r.freshnessDays,
        state: ev.state,
        satisfied: ev.satisfied,
        rejectedComment: ev.rejectedComment,
        bestValidUntil: ev.bestValidUntil,
        links: r.links
          .filter((l) => !l.deleted)
          .map((l) => ({
            linkId: l.linkId,
            evidenceId: l.evidenceId,
            title: l.title,
            status: l.status,
            validUntil: l.validUntil,
            freshness: freshnessOf(l.validUntil, snap.today),
          })),
      };
    });
  const descriptions = await db.evidenceRequirement.findMany({
    where: { organizationId: ctx.org.id, controlId: control.id, archivedAt: null },
    select: { id: true, description: true },
  });
  const descById = new Map(descriptions.map((d) => [d.id, d.description]));

  const [activity, members, frameworkRequirements, evidenceLibrary] = await Promise.all([
    listResourceActivity(ctx, "control", control.id, 50),
    listMemberOptions(ctx),
    db.frameworkRequirement.findMany({
      where: {
        kind: "REQUIREMENT",
        framework: { organizationAdoptions: { some: { organizationId: ctx.org.id } } },
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, title: true, framework: { select: { name: true } } },
    }),
    db.evidence.findMany({
      where: { organizationId: ctx.org.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, title: true, status: true, category: true },
    }),
  ]);

  const isOwner = control.ownerId === ctx.user.id;
  return {
    control: {
      ...control,
      nextReviewDate: toDateOnlyOrNull(control.nextReviewDate),
    },
    today: snap.today,
    health: evaluation.health,
    reviewOverdue: evaluation.reviewOverdue,
    applicable,
    evidenceProgress: { satisfied: evaluation.requiredSatisfied, total: evaluation.requiredTotal },
    requirements: control.requirements
      .map((r) => ({ ...r.requirement, inScope: inScopeAll.has(r.requirement.id) }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    evidenceRequirements: evidenceRequirements.map((r) => ({
      ...r,
      description: descById.get(r.id) ?? null,
    })),
    generalEvidence: control.evidenceLinks
      .filter((l) => !l.evidence.deletedAt)
      .map((l) => ({
        linkId: l.id,
        ...l.evidence,
        validUntil: toDateOnlyOrNull(l.evidence.validUntil),
      })),
    tasks: control.taskLinks.map((t) => ({ ...t.task, dueDate: toDateOnlyOrNull(t.task.dueDate) })),
    risks: control.riskLinks.map((r) => r.risk).filter((r) => !r.archivedAt),
    activity,
    members,
    frameworkRequirements,
    evidenceLibrary,
    permissions: {
      manage: can(ctx, "control.manage"),
      updateStatus: can(ctx, "control.updateStatus", { ownerId: control.ownerId }),
      updateStatusReason: denialReason(ctx, "control.updateStatus", { ownerId: control.ownerId }),
      review: can(ctx, "control.review", { ownerId: control.ownerId }),
      reviewReason: denialReason(ctx, "control.review", { ownerId: control.ownerId }),
      contributeEvidence: can(ctx, "evidence.contribute"),
      createTask: can(ctx, "task.create"),
      createRisk: can(ctx, "risk.create"),
      isOwner,
    },
  };
}
export type ControlDetail = Awaited<ReturnType<typeof getControlDetail>>;
