import "server-only";
import { db } from "@/server/db";
import type { OrgContext } from "@/server/context";
import { todayInTimeZone, toDateOnlyOrNull, type DateOnly } from "@/lib/dates";
import {
  evaluateControl,
  evaluateFramework,
  type ControlEvaluation,
  type ControlInput,
  type FrameworkInput,
  type FrameworkReadiness,
} from "../engine";
import { detectGaps, type Gap, type GapEvidenceInput, type GapRiskInput, type GapTaskInput } from "@/features/gaps/engine";

/**
 * Loads everything the readiness and gap engines need for one organization in a fixed, small
 * number of queries (no N+1), then evaluates it with the pure engines.
 */

export type FrameworkSnapshot = FrameworkInput & {
  name: string;
  shortName: string;
  requirementLabel: string;
  requirementShortLabel: string;
  organizationFrameworkId: string;
  requirementDetails: Map<string, { code: string; title: string; summary: string; kind: "GROUP" | "REQUIREMENT"; parentId: string | null; isScopeRequired: boolean; sortOrder: number }>;
};

export type ControlSnapshot = ControlInput & {
  domain: string | null;
  reviewFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY";
  lastReviewedAt: Date | null;
  ownerName: string | null;
  updatedAt: Date;
};

export type ComplianceSnapshot = {
  today: DateOnly;
  now: Date;
  frameworks: FrameworkSnapshot[];
  controls: ControlSnapshot[];
  evaluations: Map<string, ControlEvaluation>;
  readiness: FrameworkReadiness[];
  /** Requirement id → code, across adopted frameworks (for criteria chips). */
  requirementCodes: Map<string, { code: string; frameworkKey: string }>;
};

export async function loadFrameworks(organizationId: string): Promise<FrameworkSnapshot[]> {
  const adopted = await db.organizationFramework.findMany({
    where: { organizationId },
    orderBy: { adoptedAt: "asc" },
    select: {
      id: true,
      scopes: { select: { requirementId: true } },
      framework: {
        select: {
          id: true,
          key: true,
          name: true,
          shortName: true,
          requirementLabel: true,
          requirementShortLabel: true,
          requirements: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, code: true, title: true, summary: true, kind: true, parentId: true, isScopeRequired: true, sortOrder: true },
          },
        },
      },
    },
  });
  return adopted.map((a) => ({
    id: a.framework.id,
    key: a.framework.key,
    name: a.framework.name,
    shortName: a.framework.shortName,
    requirementLabel: a.framework.requirementLabel,
    requirementShortLabel: a.framework.requirementShortLabel,
    organizationFrameworkId: a.id,
    inScopeCategoryIds: a.scopes.map((s) => s.requirementId),
    requirements: a.framework.requirements.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      kind: r.kind,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
    })),
    requirementDetails: new Map(a.framework.requirements.map((r) => [r.id, r])),
  }));
}

export async function loadControlInputs(organizationId: string, options: { includeArchived?: boolean } = {}): Promise<ControlSnapshot[]> {
  const controls = await db.control.findMany({
    where: { organizationId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      domain: true,
      status: true,
      priority: true,
      ownerId: true,
      owner: { select: { name: true } },
      archivedAt: true,
      nextReviewDate: true,
      lastReviewedAt: true,
      reviewFrequency: true,
      updatedAt: true,
      requirements: { select: { requirementId: true } },
      evidenceRequirements: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          isRequired: true,
          archivedAt: true,
          freshnessDays: true,
          links: {
            select: {
              id: true,
              evidence: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  deletedAt: true,
                  validUntil: true,
                  reviewComment: true,
                  createdAt: true,
                  currentVersion: { select: { createdAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return controls.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    domain: c.domain,
    status: c.status,
    priority: c.priority,
    ownerId: c.ownerId,
    ownerName: c.owner?.name ?? null,
    archived: c.archivedAt !== null,
    nextReviewDate: toDateOnlyOrNull(c.nextReviewDate),
    lastReviewedAt: c.lastReviewedAt,
    reviewFrequency: c.reviewFrequency,
    updatedAt: c.updatedAt,
    requirementIds: c.requirements.map((r) => r.requirementId),
    evidenceRequirements: c.evidenceRequirements.map((r) => ({
      id: r.id,
      title: r.title,
      isRequired: r.isRequired,
      archived: r.archivedAt !== null,
      freshnessDays: r.freshnessDays,
      links: r.links.map((l) => ({
        linkId: l.id,
        evidenceId: l.evidence.id,
        title: l.evidence.title,
        status: l.evidence.status,
        deleted: l.evidence.deletedAt !== null,
        validUntil: toDateOnlyOrNull(l.evidence.validUntil),
        reviewComment: l.evidence.reviewComment,
        submittedAt: l.evidence.currentVersion?.createdAt ?? l.evidence.createdAt,
      })),
    })),
  }));
}

export async function loadComplianceSnapshot(
  ctx: Pick<OrgContext, "org">,
  options: { includeArchived?: boolean; now?: Date } = {},
): Promise<ComplianceSnapshot> {
  const now = options.now ?? new Date();
  const today = todayInTimeZone(ctx.org.timezone, now);
  const [frameworks, controls] = await Promise.all([
    loadFrameworks(ctx.org.id),
    loadControlInputs(ctx.org.id, { includeArchived: options.includeArchived }),
  ]);
  const evaluations = new Map(controls.map((c) => [c.id, evaluateControl(c, today)]));
  const readiness = frameworks.map((f) => evaluateFramework(f, controls, evaluations));
  const requirementCodes = new Map<string, { code: string; frameworkKey: string }>();
  for (const f of frameworks) for (const r of f.requirements) requirementCodes.set(r.id, { code: r.code, frameworkKey: f.key });
  return { today, now, frameworks, controls, evaluations, readiness, requirementCodes };
}

export async function loadGapInputs(organizationId: string) {
  const [evidence, tasks, risks] = await Promise.all([
    db.evidence.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["PENDING_REVIEW", "REJECTED"] } },
      select: { id: true, title: true, status: true, deletedAt: true, reviewComment: true, createdAt: true, currentVersion: { select: { createdAt: true } } },
    }),
    db.task.findMany({
      where: { organizationId, status: { notIn: ["DONE", "CANCELED"] } },
      select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true, gapKey: true, controls: { select: { controlId: true } } },
    }),
    db.risk.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, number: true, title: true, status: true, severity: true, dueDate: true, gapKey: true, archivedAt: true, controls: { select: { controlId: true } } },
    }),
  ]);
  const gapEvidence: GapEvidenceInput[] = evidence.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    deleted: e.deletedAt !== null,
    submittedAt: e.currentVersion?.createdAt ?? e.createdAt,
    reviewComment: e.reviewComment,
  }));
  const gapTasks: (GapTaskInput & { gapKey: string | null })[] = tasks.map((t) => ({
    id: t.id,
    number: t.number,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: toDateOnlyOrNull(t.dueDate),
    controlIds: t.controls.map((c) => c.controlId),
    gapKey: t.gapKey,
  }));
  const gapRisks: (GapRiskInput & { gapKey: string | null })[] = risks.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    severity: r.severity,
    dueDate: toDateOnlyOrNull(r.dueDate),
    archived: r.archivedAt !== null,
    controlIds: r.controls.map((c) => c.controlId),
    gapKey: r.gapKey,
  }));
  return { evidence: gapEvidence, tasks: gapTasks, risks: gapRisks };
}

export type TrackedBy = { kind: "task" | "risk"; id: string; label: string };

export type GapWithTracking = Gap & { trackedBy: TrackedBy[] };

/** Detected gaps plus the open tasks / active risks that already track each gap. */
export async function loadGaps(ctx: Pick<OrgContext, "org">, snapshot?: ComplianceSnapshot): Promise<{ snapshot: ComplianceSnapshot; gaps: GapWithTracking[] }> {
  const snap = snapshot ?? (await loadComplianceSnapshot(ctx));
  const inputs = await loadGapInputs(ctx.org.id);
  const gaps = detectGaps({
    today: snap.today,
    now: snap.now,
    frameworks: snap.frameworks,
    controls: snap.controls,
    evidence: inputs.evidence,
    tasks: inputs.tasks,
    risks: inputs.risks,
    evaluations: snap.evaluations,
  });
  const tracked = new Map<string, TrackedBy[]>();
  for (const t of inputs.tasks) {
    if (!t.gapKey) continue;
    tracked.set(t.gapKey, [...(tracked.get(t.gapKey) ?? []), { kind: "task", id: t.id, label: `TSK-${t.number}` }]);
  }
  for (const r of inputs.risks) {
    if (!r.gapKey || !(r.status === "OPEN" || r.status === "IN_PROGRESS")) continue;
    tracked.set(r.gapKey, [...(tracked.get(r.gapKey) ?? []), { kind: "risk", id: r.id, label: `RSK-${r.number}` }]);
  }
  return { snapshot: snap, gaps: gaps.map((g) => ({ ...g, trackedBy: tracked.get(g.key) ?? [] })) };
}
