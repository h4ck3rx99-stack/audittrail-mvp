import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/authz/context";
import { getFrameworkTree, type TreeNode } from "@/features/frameworks/server/queries";
import { ReadinessDefinition } from "@/components/app/definition";
import { FilterLink, PageHeader, Panel } from "@/components/app/primitives";
import { COVERAGE, Dot, HEALTH, Status, StatusBadge } from "@/components/app/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Framework" };

function hasMatch(node: TreeNode, uncoveredOnly: boolean, inScopeOnly: boolean): boolean {
  if (node.kind === "REQUIREMENT") {
    if (inScopeOnly && !node.inScope) return false;
    if (uncoveredOnly && node.coverage !== "UNCOVERED") return false;
    return true;
  }
  return node.children.some((c) => hasMatch(c, uncoveredOnly, inScopeOnly));
}

export default async function FrameworkPage({ params, searchParams }: PageProps<"/org/[orgSlug]/frameworks/[frameworkKey]">) {
  const { orgSlug, frameworkKey } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const data = await getFrameworkTree(ctx, frameworkKey);
  const uncoveredOnly = sp.uncovered === "1";
  const inScopeOnly = sp.inScope === "1";
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const base = `/org/${ctx.org.slug}`;
  const self = `${base}/frameworks/${data.framework.key}`;
  const qs = (u: boolean, s: boolean) => {
    const p = new URLSearchParams();
    if (u) p.set("uncovered", "1");
    if (s) p.set("inScope", "1");
    const q = p.toString();
    return q ? `${self}?${q}` : self;
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-2 text-xs text-muted-foreground">
        <Link href={`${base}/frameworks`} className="hover:underline">
          Frameworks
        </Link>{" "}
        / {data.framework.name}
      </div>
      <PageHeader
        title={data.framework.name}
        description={`${data.framework.requirementLabel}. Each criterion is Covered when at least one applicable mapped control is Ready, Partial when mapped controls exist but none are Ready, and Uncovered otherwise.`}
        meta={
          <>
            <span>Readiness {data.readiness.readiness.pct === null ? "—" : `${data.readiness.readiness.pct}%`}</span>
            <span>Evidence coverage {data.readiness.evidenceCoverage.pct === null ? "—" : `${data.readiness.evidenceCoverage.pct}%`}</span>
            <ReadinessDefinition />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={qs(!uncoveredOnly, inScopeOnly)} active={uncoveredOnly}>
          Uncovered only
        </FilterLink>
        <FilterLink href={qs(uncoveredOnly, !inScopeOnly)} active={inScopeOnly}>
          In scope only
        </FilterLink>
      </div>

      <div className="flex flex-col gap-4">
        {data.tree
          .filter((cat) => hasMatch(cat, uncoveredOnly, inScopeOnly) || (!uncoveredOnly && !inScopeOnly))
          .map((cat) => (
            <details key={cat.id} open={cat.inScope} className="group rounded-md border border-border bg-surface">
              <summary className={cn("flex cursor-pointer list-none items-center gap-3 px-4 py-3", !cat.inScope && "text-muted-foreground")}>
                <span className="mono text-xs text-muted-foreground">{cat.code}</span>
                <span className="text-sm font-semibold">{cat.title}</span>
                {cat.inScope ? (
                  <span className="ml-auto flex gap-3 text-xs text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1"><Dot tone="success" /> {cat.counts.covered}</span>
                    <span className="inline-flex items-center gap-1"><Dot tone="warning" /> {cat.counts.partial}</span>
                    <span className="inline-flex items-center gap-1"><Dot tone="danger" /> {cat.counts.uncovered}</span>
                  </span>
                ) : (
                  <span className="ml-auto">
                    <StatusBadge tone="muted" label="Out of scope" />
                  </span>
                )}
              </summary>
              <div className="border-t border-border">
                {cat.children
                  .filter((series) => hasMatch(series, uncoveredOnly, inScopeOnly))
                  .map((series) => (
                    <div key={series.id} className="border-b border-border last:border-0">
                      <div className="flex items-center gap-2 bg-subtle px-4 py-2">
                        <span className="mono text-xs text-muted-foreground">{series.code}</span>
                        <span className="text-[13px] font-medium">{series.title}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{series.summary}</span>
                      </div>
                      <ul>
                        {series.children
                          .filter((req) => hasMatch(req, uncoveredOnly, inScopeOnly))
                          .map((req) => (
                            <li
                              key={req.id}
                              id={req.code}
                              className={cn("grid gap-2 border-t border-border px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", focus === req.code && "bg-accent-subtle", !req.inScope && "opacity-60")}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="mono text-xs font-medium">{req.code}</span>
                                  <span className="text-[13px] font-medium">{req.title}</span>
                                  {req.coverage ? <Status map={COVERAGE} value={req.coverage} /> : null}
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{req.summary}</p>
                              </div>
                              <div className="min-w-0">
                                {req.controls.length === 0 ? (
                                  <p className="text-xs text-faint-foreground">No mapped controls.</p>
                                ) : (
                                  <ul className="flex flex-col gap-1">
                                    {req.controls.map((c) => (
                                      <li key={c.id} className="flex items-center gap-2 text-[13px]">
                                        <Link href={`${base}/controls/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                                          <span className="mono mr-1.5 text-muted-foreground">{c.code}</span>
                                          {c.name}
                                        </Link>
                                        <Status map={HEALTH} value={c.health ?? "NA"} text />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </details>
          ))}
      </div>
      <Panel className="mt-4 p-4 text-xs text-muted-foreground">
        Criterion summaries are original paraphrases written for AuditTrail. Refer to the AICPA Trust Services Criteria for the authoritative text.
      </Panel>
    </div>
  );
}
