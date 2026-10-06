import { addDays, addMonths, diffDays, type DateOnly } from "@/lib/dates";

/**
 * The readiness engine: pure functions over plain data. It is the single source of truth for
 * health, readiness %, evidence coverage and requirement coverage, used by the dashboard,
 * controls list, framework view, gaps and tests.
 */

export type ControlStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "NOT_APPLICABLE";
export type PriorityValue = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvidenceStatusValue = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export const EXPIRING_SOON_DAYS = 30;

export type EvidenceLinkInput = {
  linkId: string;
  evidenceId: string;
  title: string;
  status: EvidenceStatusValue;
  deleted: boolean;
  validUntil: DateOnly | null;
  reviewComment: string | null;
  /** When the current version (or the link evidence) was submitted. */
  submittedAt: Date;
};

export type EvidenceRequirementInput = {
  id: string;
  title: string;
  isRequired: boolean;
  archived: boolean;
  freshnessDays: number;
  links: EvidenceLinkInput[];
};

export type ControlInput = {
  id: string;
  code: string;
  name: string;
  status: ControlStatusValue;
  priority: PriorityValue;
  ownerId: string | null;
  archived: boolean;
  nextReviewDate: DateOnly | null;
  requirementIds: string[];
  evidenceRequirements: EvidenceRequirementInput[];
};

export type RequirementInput = {
  id: string;
  code: string;
  title: string;
  kind: "GROUP" | "REQUIREMENT";
  parentId: string | null;
  sortOrder: number;
};

export type FrameworkInput = {
  id: string;
  key: string;
  name: string;
  requirements: RequirementInput[];
  /** IDs of the top-level GROUP requirements that are in scope. */
  inScopeCategoryIds: string[];
};

// ─── Evidence freshness and requirement state ───────────────────────────────

export type Freshness = "CURRENT" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

export function freshnessOf(validUntil: DateOnly | null, today: DateOnly): Freshness {
  if (!validUntil) return "NO_EXPIRY";
  if (validUntil < today) return "EXPIRED";
  if (diffDays(today, validUntil) <= EXPIRING_SOON_DAYS) return "EXPIRING_SOON";
  return "CURRENT";
}

/** Approved, not deleted, and either no validUntil or validUntil on/after today. */
export function isSatisfyingEvidence(link: EvidenceLinkInput, today: DateOnly): boolean {
  return !link.deleted && link.status === "APPROVED" && (link.validUntil === null || link.validUntil >= today);
}

export type RequirementState = "SATISFIED" | "EXPIRING_SOON" | "PENDING_REVIEW" | "REJECTED" | "EXPIRED" | "MISSING";

export type RequirementEvaluation = {
  state: RequirementState;
  satisfied: boolean;
  /** Latest validity date among satisfying evidence (null when none or no expiry). */
  bestValidUntil: DateOnly | null;
  rejectedComment: string | null;
};

export function evaluateEvidenceRequirement(req: EvidenceRequirementInput, today: DateOnly): RequirementEvaluation {
  const live = req.links.filter((l) => !l.deleted);
  const satisfying = live.filter((l) => isSatisfyingEvidence(l, today));
  if (satisfying.length > 0) {
    const noExpiry = satisfying.some((l) => l.validUntil === null);
    const best = noExpiry
      ? null
      : satisfying.map((l) => l.validUntil as DateOnly).sort().at(-1) ?? null;
    const expiring = best !== null && freshnessOf(best, today) === "EXPIRING_SOON";
    return { state: expiring ? "EXPIRING_SOON" : "SATISFIED", satisfied: true, bestValidUntil: best, rejectedComment: null };
  }
  if (live.some((l) => l.status === "PENDING_REVIEW")) {
    return { state: "PENDING_REVIEW", satisfied: false, bestValidUntil: null, rejectedComment: null };
  }
  if (live.some((l) => l.status === "APPROVED")) {
    return { state: "EXPIRED", satisfied: false, bestValidUntil: null, rejectedComment: null };
  }
  const rejected = live
    .filter((l) => l.status === "REJECTED")
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  if (rejected) {
    return { state: "REJECTED", satisfied: false, bestValidUntil: null, rejectedComment: rejected.reviewComment };
  }
  return { state: "MISSING", satisfied: false, bestValidUntil: null, rejectedComment: null };
}

// ─── Control health ─────────────────────────────────────────────────────────

export type Health = "READY" | "ATTENTION" | "NOT_READY";

export function isReviewOverdue(control: Pick<ControlInput, "nextReviewDate">, today: DateOnly): boolean {
  return control.nextReviewDate !== null && control.nextReviewDate < today;
}

export function activeRequiredEvidence(control: ControlInput): EvidenceRequirementInput[] {
  return control.evidenceRequirements.filter((r) => !r.archived && r.isRequired);
}

export type ControlEvaluation = {
  /** null for archived and NOT_APPLICABLE controls (health does not apply). */
  health: Health | null;
  reviewOverdue: boolean;
  requiredTotal: number;
  requiredSatisfied: number;
  requirements: Map<string, RequirementEvaluation>;
};

export function evaluateControl(control: ControlInput, today: DateOnly): ControlEvaluation {
  const requirements = new Map<string, RequirementEvaluation>();
  for (const r of control.evidenceRequirements) {
    if (!r.archived) requirements.set(r.id, evaluateEvidenceRequirement(r, today));
  }
  const required = activeRequiredEvidence(control);
  const requiredSatisfied = required.filter((r) => requirements.get(r.id)?.satisfied).length;
  const reviewOverdue = isReviewOverdue(control, today);

  let health: Health | null;
  if (control.archived || control.status === "NOT_APPLICABLE") health = null;
  else if (control.status !== "IMPLEMENTED") health = "NOT_READY";
  else if (requiredSatisfied < required.length || reviewOverdue) health = "ATTENTION";
  else health = "READY";

  return { health, reviewOverdue, requiredTotal: required.length, requiredSatisfied, requirements };
}

// ─── Framework scoring ──────────────────────────────────────────────────────

export type RequirementCoverage = "COVERED" | "PARTIAL" | "UNCOVERED";

/** Maps every requirement to its top-level category id (GROUP with no parent). */
export function categoryIndex(requirements: RequirementInput[]): Map<string, string> {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const result = new Map<string, string>();
  for (const r of requirements) {
    let cur: RequirementInput | undefined = r;
    let guard = 0;
    while (cur && cur.parentId && guard++ < 20) cur = byId.get(cur.parentId);
    if (cur) result.set(r.id, cur.id);
  }
  return result;
}

export function inScopeRequirementIds(framework: FrameworkInput): Set<string> {
  const categories = categoryIndex(framework.requirements);
  const inScope = new Set(framework.inScopeCategoryIds);
  return new Set(
    framework.requirements
      .filter((r) => r.kind === "REQUIREMENT" && inScope.has(categories.get(r.id) ?? ""))
      .map((r) => r.id),
  );
}

/** Applicable: not archived, not N/A, mapped to at least one in-scope requirement of the framework. */
export function isApplicable(control: ControlInput, inScope: Set<string>): boolean {
  return !control.archived && control.status !== "NOT_APPLICABLE" && control.requirementIds.some((id) => inScope.has(id));
}

export type Score = { numerator: number; denominator: number; pct: number | null };

export function score(numerator: number, denominator: number): Score {
  return { numerator, denominator, pct: denominator === 0 ? null : Math.round((numerator / denominator) * 100) };
}

export type BreakdownRow = { requirementId: string; code: string; title: string; applicable: number; ready: number; score: Score };

export type FrameworkReadiness = {
  frameworkId: string;
  frameworkKey: string;
  applicableControlIds: string[];
  readiness: Score;
  evidenceCoverage: Score;
  missingRequiredEvidence: number;
  coverage: Map<string, { state: RequirementCoverage; controlIds: string[] }>;
  categories: BreakdownRow[];
  series: BreakdownRow[];
  statusDistribution: Record<ControlStatusValue, number>;
};

export function evaluateFramework(
  framework: FrameworkInput,
  controls: ControlInput[],
  evaluations: Map<string, ControlEvaluation>,
): FrameworkReadiness {
  const inScope = inScopeRequirementIds(framework);
  const frameworkRequirementIds = new Set(framework.requirements.map((r) => r.id));
  const applicable = controls.filter((c) => isApplicable(c, inScope));
  const ready = applicable.filter((c) => evaluations.get(c.id)?.health === "READY");

  let requiredTotal = 0;
  let requiredSatisfied = 0;
  for (const c of applicable) {
    const e = evaluations.get(c.id);
    if (!e) continue;
    requiredTotal += e.requiredTotal;
    requiredSatisfied += e.requiredSatisfied;
  }

  // Requirement coverage over in-scope requirements, using applicable mapped controls.
  const controlsByRequirement = new Map<string, ControlInput[]>();
  for (const c of applicable) {
    for (const rid of c.requirementIds) {
      if (!inScope.has(rid)) continue;
      const list = controlsByRequirement.get(rid) ?? [];
      list.push(c);
      controlsByRequirement.set(rid, list);
    }
  }
  const coverage = new Map<string, { state: RequirementCoverage; controlIds: string[] }>();
  for (const r of framework.requirements) {
    if (r.kind !== "REQUIREMENT") continue;
    const mapped = controlsByRequirement.get(r.id) ?? [];
    const state: RequirementCoverage =
      mapped.length === 0 ? "UNCOVERED" : mapped.some((c) => evaluations.get(c.id)?.health === "READY") ? "COVERED" : "PARTIAL";
    coverage.set(r.id, { state, controlIds: mapped.map((c) => c.id) });
  }

  // Breakdown per in-scope category and per series (second-level GROUP).
  const byId = new Map(framework.requirements.map((r) => [r.id, r]));
  const categories = categoryIndex(framework.requirements);
  const seriesOf = (rid: string): string | null => {
    let cur = byId.get(rid);
    let guard = 0;
    while (cur && cur.parentId && guard++ < 20) {
      const parent = byId.get(cur.parentId);
      if (parent && !parent.parentId) return cur.id;
      cur = parent;
    }
    return null;
  };
  const rowFor = (groupId: string, belongs: (c: ControlInput) => boolean): BreakdownRow => {
    const g = byId.get(groupId)!;
    const inGroup = applicable.filter(belongs);
    const readyCount = inGroup.filter((c) => evaluations.get(c.id)?.health === "READY").length;
    return { requirementId: g.id, code: g.code, title: g.title, applicable: inGroup.length, ready: readyCount, score: score(readyCount, inGroup.length) };
  };
  const categoryRows = framework.requirements
    .filter((r) => r.kind === "GROUP" && r.parentId === null && framework.inScopeCategoryIds.includes(r.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => rowFor(g.id, (c) => c.requirementIds.some((rid) => inScope.has(rid) && categories.get(rid) === g.id)));
  const seriesRows = framework.requirements
    .filter((r) => r.kind === "GROUP" && r.parentId !== null && framework.inScopeCategoryIds.includes(categories.get(r.id) ?? ""))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => rowFor(g.id, (c) => c.requirementIds.some((rid) => inScope.has(rid) && seriesOf(rid) === g.id)));

  const statusDistribution: Record<ControlStatusValue, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, IMPLEMENTED: 0, NOT_APPLICABLE: 0 };
  for (const c of controls) {
    if (c.archived) continue;
    if (!c.requirementIds.some((rid) => frameworkRequirementIds.has(rid))) continue;
    statusDistribution[c.status] += 1;
  }

  return {
    frameworkId: framework.id,
    frameworkKey: framework.key,
    applicableControlIds: applicable.map((c) => c.id),
    readiness: score(ready.length, applicable.length),
    evidenceCoverage: score(requiredSatisfied, requiredTotal),
    missingRequiredEvidence: requiredTotal - requiredSatisfied,
    coverage,
    categories: categoryRows,
    series: seriesRows,
    statusDistribution,
  };
}

// ─── Review scheduling ──────────────────────────────────────────────────────

export type ReviewFrequencyValue = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY";

export const REVIEW_FREQUENCY_MONTHS: Record<ReviewFrequencyValue, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
};

export function computeNextReviewDate(from: DateOnly, frequency: ReviewFrequencyValue): DateOnly {
  return addMonths(from, REVIEW_FREQUENCY_MONTHS[frequency]);
}

/** validUntil set on approval when none was given: collectedAt + shortest linked freshness, else org default. */
export function defaultValidUntil(collectedAt: DateOnly, linkedFreshnessDays: number[], orgDefaultDays: number): DateOnly {
  const days = linkedFreshnessDays.length > 0 ? Math.min(...linkedFreshnessDays) : orgDefaultDays;
  return addDays(collectedAt, days);
}
