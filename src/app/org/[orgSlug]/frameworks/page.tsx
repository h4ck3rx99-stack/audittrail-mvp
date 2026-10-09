import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { listAdoptedFrameworks } from "@/features/frameworks/server/queries";
import { ReadinessDefinition } from "@/components/app/definition";
import { EmptyState, Meter, PageHeader, Panel } from "@/components/app/primitives";
import { Dot } from "@/components/app/status";

export const metadata: Metadata = { title: "Frameworks" };

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default async function FrameworksPage({ params }: PageProps<"/org/[orgSlug]/frameworks">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const frameworks = await listAdoptedFrameworks(ctx);
  const base = `/org/${ctx.org.slug}`;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Frameworks"
        description="Adopted frameworks and how ready you are against each."
        meta={<ReadinessDefinition />}
      />
      {frameworks.length === 0 ? (
        <EmptyState
          title="No framework adopted"
          description="Adopt SOC 2 to get the Trust Services Criteria as a requirement tree and, optionally, a starter control set."
          action={
            can(ctx, "framework.manage") ? (
              <Link
                href={`${base}/settings/frameworks`}
                className="text-accent text-[13px] hover:underline"
              >
                Adopt SOC 2
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {frameworks.map((f) => (
            <Panel key={f.key} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    href={`${base}/frameworks/${f.key}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {f.name}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-[13px]">
                    {f.requirementLabel} · In scope: {f.scope.join(", ")}
                  </p>
                </div>
                <div className="flex gap-8">
                  <div>
                    <p className="text-muted-foreground text-xs">Readiness</p>
                    <p className="text-2xl font-semibold tabular-nums">{pct(f.readiness.pct)}</p>
                    <p className="text-muted-foreground text-xs">
                      {f.readiness.numerator} of {f.readiness.denominator} controls ready
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Evidence coverage</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {pct(f.evidenceCoverage.pct)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {f.evidenceCoverage.numerator} of {f.evidenceCoverage.denominator}{" "}
                      requirements
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="success" /> {f.coverage.COVERED} covered
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="warning" /> {f.coverage.PARTIAL} partial
                </span>
                <Link
                  href={`${base}/frameworks/${f.key}?uncovered=1`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Dot tone="danger" /> {f.coverage.UNCOVERED} uncovered
                </Link>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {f.categories.map((c) => (
                  <div
                    key={c.requirementId}
                    className="grid grid-cols-[1fr_120px_auto] items-center gap-3 text-[13px]"
                  >
                    <span className="truncate">{c.title}</span>
                    <Meter value={c.score.pct} label={`${c.title} readiness`} />
                    <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
                      {pct(c.score.pct)} · {c.ready}/{c.applicable}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
