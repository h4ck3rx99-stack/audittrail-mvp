import { diffDays, formatDateOnly, type DateOnly } from "@/lib/dates";
import { riskKey, taskKey } from "@/lib/utils";
import {
  evaluateControl,
  inScopeRequirementIds,
  isApplicable,
  type ControlEvaluation,
  type ControlInput,
  type FrameworkInput,
  type PriorityValue,
} from "@/features/readiness/engine";

/**
 * Detected gaps are computed live from current state by this pure function. They are never
 * stored as truth; tasks and risks can reference a gap by its stable gapKey.
 */

export type GapType =
  | "control_unowned"
  | "evidence_missing"
  | "evidence_expired"
  | "evidence_expiring"
  | "evidence_rejected"
  | "evidence_pending_stale"
  | "review_overdue"
  | "requirement_uncovered"
  | "task_overdue"
  | "risk_overdue";

export const GAP_TYPE_LABELS: Record<GapType, string> = {
  requirement_uncovered: "Requirements without controls",
  evidence_expired: "Expired evidence",
  control_unowned: "Controls without an owner",
  evidence_missing: "Missing required evidence",
  evidence_rejected: "Rejected evidence",
  review_overdue: "Control reviews overdue",
  task_overdue: "Overdue tasks",
  risk_overdue: "Risks past their due date",
  evidence_expiring: "Evidence expiring soon",
  evidence_pending_stale: "Evidence waiting for review",
};

export const GAP_TYPE_ORDER: GapType[] = Object.keys(GAP_TYPE_LABELS) as GapType[];

export const PENDING_STALE_DAYS = 7;

export type Gap = {
  key: string;
  type: GapType;
  severity: PriorityValue;
  title: string;
  explanation: string;
  /** Path relative to /org/[slug]. */
  link: string;
  suggestedAction: string;
  /** Controls to pre-link when creating a task or risk from this gap. */
  controlIds: string[];
};

export type GapTaskInput = {
  id: string;
  number: number;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";
  priority: PriorityValue;
  dueDate: DateOnly | null;
  controlIds: string[];
};

export type GapRiskInput = {
  id: string;
  number: number;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "MITIGATED" | "ACCEPTED" | "CLOSED";
  severity: PriorityValue;
  dueDate: DateOnly | null;
  archived: boolean;
  controlIds: string[];
};

export type GapEvidenceInput = {
  id: string;
  title: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  deleted: boolean;
  submittedAt: Date;
  reviewComment: string | null;
};

export type GapInput = {
  today: DateOnly;
  now: Date;
  frameworks: FrameworkInput[];
  controls: ControlInput[];
  evidence: GapEvidenceInput[];
  tasks: GapTaskInput[];
  risks: GapRiskInput[];
  /** Precomputed evaluations (optional; computed when absent). */
  evaluations?: Map<string, ControlEvaluation>;
};

export const SEVERITY_RANK: Record<PriorityValue, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function detectGaps(input: GapInput): Gap[] {
  const { today } = input;
  const evaluations = input.evaluations ?? new Map(input.controls.map((c) => [c.id, evaluateControl(c, today)]));
  const gaps: Gap[] = [];

  // Applicable = applicable for at least one adopted framework.
  const inScopeSets = input.frameworks.map((f) => inScopeRequirementIds(f));
  const applicable = input.controls.filter((c) => inScopeSets.some((s) => isApplicable(c, s)));
  const applicableIds = new Set(applicable.map((c) => c.id));

  for (const c of applicable) {
    const evaluation = evaluations.get(c.id);
    const link = `/controls/${c.id}`;

    if (!c.ownerId) {
      gaps.push({
        key: `control_unowned:${c.id}`,
        type: "control_unowned",
        severity: c.priority === "HIGH" || c.priority === "CRITICAL" ? "HIGH" : "MEDIUM",
        title: `${c.code} has no owner`,
        explanation: `"${c.name}" is in scope but nobody is accountable for operating it.`,
        link,
        suggestedAction: "Assign an owner",
        controlIds: [c.id],
      });
    }

    if (evaluation?.reviewOverdue && c.nextReviewDate) {
      const days = diffDays(c.nextReviewDate, today);
      gaps.push({
        key: `review_overdue:${c.id}`,
        type: "review_overdue",
        severity: "MEDIUM",
        title: `Review of ${c.code} is ${days} ${days === 1 ? "day" : "days"} overdue`,
        explanation: `The control review was due ${formatDateOnly(c.nextReviewDate)}.`,
        link: `${link}?tab=reviews`,
        suggestedAction: "Record a control review",
        controlIds: [c.id],
      });
    }

    for (const req of c.evidenceRequirements) {
      if (req.archived) continue;
      const state = evaluation?.requirements.get(req.id)?.state;
      const reqLink = `${link}?tab=evidence`;
      if (req.isRequired && state === "MISSING") {
        gaps.push({
          key: `evidence_missing:${req.id}`,
          type: "evidence_missing",
          severity: c.priority,
          title: `Missing evidence: ${req.title}`,
          explanation: `${c.code} requires this evidence and nothing has been provided.`,
          link: reqLink,
          suggestedAction: "Upload evidence",
          controlIds: [c.id],
        });
      }
      if (req.isRequired && state === "EXPIRED") {
        gaps.push({
          key: `evidence_expired:${req.id}`,
          type: "evidence_expired",
          severity: "HIGH",
          title: `Expired evidence: ${req.title}`,
          explanation: `The approved evidence for ${c.code} is past its validity date and no current replacement exists.`,
          link: reqLink,
          suggestedAction: "Upload a current version",
          controlIds: [c.id],
        });
      }
      if (state === "EXPIRING_SOON") {
        const until = evaluation?.requirements.get(req.id)?.bestValidUntil;
        gaps.push({
          key: `evidence_expiring:${req.id}`,
          type: "evidence_expiring",
          severity: "LOW",
          title: `Evidence expiring soon: ${req.title}`,
          explanation: until
            ? `The evidence for ${c.code} is valid until ${formatDateOnly(until)}.`
            : `The evidence for ${c.code} expires within 30 days.`,
          link: reqLink,
          suggestedAction: "Collect fresh evidence",
          controlIds: [c.id],
        });
      }
    }
  }

  // Rejected evidence with no newer approved replacement on an applicable requirement.
  const evidenceById = new Map(input.evidence.map((e) => [e.id, e]));
  const rejectedGap = new Map<string, Set<string>>();
  for (const c of applicable) {
    const evaluation = evaluations.get(c.id);
    for (const req of c.evidenceRequirements) {
      if (req.archived) continue;
      if (evaluation?.requirements.get(req.id)?.satisfied) continue;
      for (const l of req.links) {
        if (l.deleted || l.status !== "REJECTED") continue;
        const replaced = req.links.some(
          (o) => !o.deleted && o.status === "APPROVED" && o.submittedAt.getTime() > l.submittedAt.getTime(),
        );
        if (replaced) continue;
        const set = rejectedGap.get(l.evidenceId) ?? new Set<string>();
        set.add(c.id);
        rejectedGap.set(l.evidenceId, set);
      }
    }
  }
  for (const [evidenceId, controlIds] of rejectedGap) {
    const e = evidenceById.get(evidenceId);
    if (!e) continue;
    gaps.push({
      key: `evidence_rejected:${evidenceId}`,
      type: "evidence_rejected",
      severity: "MEDIUM",
      title: `Rejected evidence: ${e.title}`,
      explanation: e.reviewComment ? `Reviewer comment: ${e.reviewComment}` : "The evidence was rejected and has not been replaced.",
      link: `/evidence/${evidenceId}`,
      suggestedAction: "Upload a corrected version",
      controlIds: [...controlIds],
    });
  }

  // Evidence pending review for more than 7 days (only evidence supporting applicable controls).
  const linkedToApplicable = new Map<string, string[]>();
  for (const c of applicable) {
    for (const req of c.evidenceRequirements) {
      for (const l of req.links) {
        const list = linkedToApplicable.get(l.evidenceId) ?? [];
        if (!list.includes(c.id)) list.push(c.id);
        linkedToApplicable.set(l.evidenceId, list);
      }
    }
  }
  for (const e of input.evidence) {
    if (e.deleted || e.status !== "PENDING_REVIEW") continue;
    const waitingDays = Math.floor((input.now.getTime() - e.submittedAt.getTime()) / 86_400_000);
    if (waitingDays <= PENDING_STALE_DAYS) continue;
    gaps.push({
      key: `evidence_pending_stale:${e.id}`,
      type: "evidence_pending_stale",
      severity: "LOW",
      title: `Waiting ${waitingDays} days for review: ${e.title}`,
      explanation: "Evidence that is not reviewed does not count toward readiness.",
      link: `/evidence/${e.id}`,
      suggestedAction: "Review the evidence",
      controlIds: linkedToApplicable.get(e.id) ?? [],
    });
  }

  // In-scope requirements with no applicable mapped control.
  input.frameworks.forEach((f, i) => {
    const inScope = inScopeSets[i]!;
    const mapped = new Set<string>();
    for (const c of applicable) for (const rid of c.requirementIds) mapped.add(rid);
    for (const r of f.requirements) {
      if (r.kind !== "REQUIREMENT" || !inScope.has(r.id) || mapped.has(r.id)) continue;
      gaps.push({
        key: `requirement_uncovered:${r.id}`,
        type: "requirement_uncovered",
        severity: "HIGH",
        title: `${r.code} has no control`,
        explanation: `No applicable control is mapped to ${r.code} (${r.title}) in ${f.name}.`,
        link: `/frameworks/${f.key}?focus=${encodeURIComponent(r.code)}`,
        suggestedAction: "Map or create a control",
        controlIds: [],
      });
    }
  });

  for (const t of input.tasks) {
    if (t.status === "DONE" || t.status === "CANCELED" || !t.dueDate || t.dueDate >= today) continue;
    const days = diffDays(t.dueDate, today);
    gaps.push({
      key: `task_overdue:${t.id}`,
      type: "task_overdue",
      severity: t.priority,
      title: `${taskKey(t.number)} is ${days} ${days === 1 ? "day" : "days"} overdue`,
      explanation: t.title,
      link: `/tasks/${t.id}`,
      suggestedAction: "Complete or reschedule the task",
      controlIds: t.controlIds.filter((id) => applicableIds.has(id)),
    });
  }

  for (const r of input.risks) {
    if (r.archived || !(r.status === "OPEN" || r.status === "IN_PROGRESS") || !r.dueDate || r.dueDate >= today) continue;
    gaps.push({
      key: `risk_overdue:${r.id}`,
      type: "risk_overdue",
      severity: r.severity,
      title: `${riskKey(r.number)} is past its due date`,
      explanation: r.title,
      link: `/risks/${r.id}`,
      suggestedAction: "Update the treatment or resolve the risk",
      controlIds: r.controlIds,
    });
  }

  return sortGaps(gaps);
}

export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      GAP_TYPE_ORDER.indexOf(a.type) - GAP_TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}

export function groupGaps(gaps: Gap[]): { type: GapType; label: string; gaps: Gap[] }[] {
  const groups = new Map<GapType, Gap[]>();
  for (const g of gaps) groups.set(g.type, [...(groups.get(g.type) ?? []), g]);
  return [...groups.entries()]
    .map(([type, list]) => ({ type, label: GAP_TYPE_LABELS[type], gaps: sortGaps(list) }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.gaps[0]!.severity] - SEVERITY_RANK[b.gaps[0]!.severity] ||
        GAP_TYPE_ORDER.indexOf(a.type) - GAP_TYPE_ORDER.indexOf(b.type),
    );
}

/** Parses a gapKey into its type and referenced id (used to validate task/risk creation from gaps). */
export function parseGapKey(key: string): { type: GapType; id: string } | null {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const type = key.slice(0, idx) as GapType;
  const id = key.slice(idx + 1);
  if (!(type in GAP_TYPE_LABELS) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { type, id };
}
