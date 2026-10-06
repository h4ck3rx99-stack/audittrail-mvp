import "server-only";
import type { OrgContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { loadComplianceSnapshot } from "@/features/readiness/server/snapshot";
import { categoryIndex, type RequirementCoverage } from "@/features/readiness/engine";

export async function listAdoptedFrameworks(ctx: OrgContext) {
  const snap = await loadComplianceSnapshot(ctx);
  return snap.frameworks.map((f) => {
    const r = snap.readiness.find((x) => x.frameworkId === f.id)!;
    const cats = categoryIndex(f.requirements);
    const counts = { COVERED: 0, PARTIAL: 0, UNCOVERED: 0 } as Record<RequirementCoverage, number>;
    for (const [id, c] of r.coverage) {
      if (f.inScopeCategoryIds.includes(cats.get(id) ?? "")) counts[c.state] += 1;
    }
    return {
      key: f.key,
      name: f.name,
      requirementLabel: f.requirementLabel,
      scope: f.requirements.filter((x) => f.inScopeCategoryIds.includes(x.id)).map((x) => x.title),
      readiness: r.readiness,
      evidenceCoverage: r.evidenceCoverage,
      coverage: counts,
      categories: r.categories,
    };
  });
}


export type TreeNode = {
  id: string;
  code: string;
  title: string;
  summary: string;
  kind: "GROUP" | "REQUIREMENT";
  inScope: boolean;
  coverage: RequirementCoverage | null;
  controls: { id: string; code: string; name: string; health: string | null; status: string }[];
  children: TreeNode[];
  counts: { covered: number; partial: number; uncovered: number };
};

export async function getFrameworkTree(ctx: OrgContext, key: string) {
  const snap = await loadComplianceSnapshot(ctx);
  const f = snap.frameworks.find((x) => x.key === key);
  if (!f) throw new NotFoundError("Framework not adopted.");
  const readiness = snap.readiness.find((r) => r.frameworkId === f.id)!;
  const cats = categoryIndex(f.requirements);
  const controlById = new Map(snap.controls.map((c) => [c.id, c]));

  // Mapped controls per requirement (including non-applicable ones, shown muted).
  const mapped = new Map<string, string[]>();
  for (const c of snap.controls) for (const rid of c.requirementIds) mapped.set(rid, [...(mapped.get(rid) ?? []), c.id]);

  const build = (parentId: string | null): TreeNode[] =>
    f.requirements
      .filter((r) => r.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => {
        const details = f.requirementDetails.get(r.id)!;
        const children = build(r.id);
        const isIn = f.inScopeCategoryIds.includes(cats.get(r.id) ?? "");
        const cov = r.kind === "REQUIREMENT" ? readiness.coverage.get(r.id)?.state ?? "UNCOVERED" : null;
        const leafCounts = { covered: 0, partial: 0, uncovered: 0 };
        if (r.kind === "REQUIREMENT" && isIn) {
          if (cov === "COVERED") leafCounts.covered++;
          else if (cov === "PARTIAL") leafCounts.partial++;
          else leafCounts.uncovered++;
        }
        for (const ch of children) {
          leafCounts.covered += ch.counts.covered;
          leafCounts.partial += ch.counts.partial;
          leafCounts.uncovered += ch.counts.uncovered;
        }
        return {
          id: r.id,
          code: r.code,
          title: r.title,
          summary: details.summary,
          kind: r.kind,
          inScope: isIn,
          coverage: isIn ? cov : null,
          controls: (mapped.get(r.id) ?? []).map((cid) => {
            const c = controlById.get(cid)!;
            return { id: c.id, code: c.code, name: c.name, status: c.status, health: snap.evaluations.get(c.id)?.health ?? null };
          }),
          children,
          counts: leafCounts,
        };
      });

  return {
    framework: { key: f.key, name: f.name, requirementLabel: f.requirementLabel, requirementShortLabel: f.requirementShortLabel },
    readiness: { readiness: readiness.readiness, evidenceCoverage: readiness.evidenceCoverage },
    tree: build(null),
  };
}
