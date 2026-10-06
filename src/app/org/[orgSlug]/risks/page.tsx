import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { loadGaps } from "@/features/readiness/server/snapshot";
import { listRisks } from "@/features/risks/server/queries";
import { listMemberOptions } from "@/features/members/server/service";
import { groupGaps, GAP_TYPE_LABELS } from "@/features/gaps/engine";
import { riskListQuerySchema, RISK_KIND_LABELS, RISK_STATUS_LABELS } from "@/features/risks/schemas";
import { PRIORITY_LABELS } from "@/features/controls/schemas";
import { DueDate, EmptyState, PageHeader, Pagination, Panel, Person, RowLink, TabLinks, Table, TableWrap, Td, Th, THead, Tr, makeQueryHref, FilterLink } from "@/components/app/primitives";
import { RISK_STATUS, SEVERITY, Status, StatusBadge } from "@/components/app/status";
import { ClearFilters, FilterBar, FilterSelect } from "@/components/app/filters";
import { Button } from "@/components/ui/button";
import { riskKey } from "@/lib/utils";

export const metadata: Metadata = { title: "Risks & Gaps" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RisksPage({ params, searchParams }: PageProps<"/org/[orgSlug]/risks">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const raw = await searchParams;
  const q = riskListQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const tab = q.tab ?? "gaps";
  const base = `/org/${ctx.org.slug}/risks`;
  const canCreateRisk = can(ctx, "risk.create");
  const canCreateTask = can(ctx, "task.create");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Risks & Gaps"
        description="Detected gaps are computed live from your current controls, evidence, reviews, tasks and risks. The risk register is your managed list of risks and tracked gaps."
        actions={
          canCreateRisk ? (
            <Button asChild variant="primary">
              <Link href={`${base}/new`}>
                <Plus />
                New risk
              </Link>
            </Button>
          ) : null
        }
      />
      <TabLinks
        tabs={[
          { href: `${base}?tab=gaps`, label: "Detected gaps", active: tab === "gaps" },
          { href: `${base}?tab=register`, label: "Risk register", active: tab === "register" },
        ]}
      />
      {tab === "gaps" ? (
        <GapsTab ctx={ctx} canCreateRisk={canCreateRisk} canCreateTask={canCreateTask} gapType={q.gapType} />
      ) : (
        <RegisterTab ctx={ctx} q={q} />
      )}
    </div>
  );
}

async function GapsTab({
  ctx,
  canCreateRisk,
  canCreateTask,
  gapType,
}: {
  ctx: Awaited<ReturnType<typeof requireOrgContext>>;
  canCreateRisk: boolean;
  canCreateTask: boolean;
  gapType?: string;
}) {
  const { gaps } = await loadGaps(ctx);
  const org = `/org/${ctx.org.slug}`;
  const groups = groupGaps(gaps);
  const shown = gapType ? groups.filter((g) => g.type === gapType) : groups;
  if (gaps.length === 0) {
    return <EmptyState title="No detected gaps" description="Every in-scope control is owned, evidenced, reviewed on time and mapped; no tasks or risks are overdue." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <FilterLink href={`${org}/risks?tab=gaps`} active={!gapType}>
          All · {gaps.length}
        </FilterLink>
        {groups.map((g) => (
          <FilterLink key={g.type} href={`${org}/risks?tab=gaps&gapType=${g.type}`} active={gapType === g.type}>
            {GAP_TYPE_LABELS[g.type]} · {g.gaps.length}
          </FilterLink>
        ))}
      </div>
      {shown.map((group) => (
        <Panel key={group.type}>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">{group.label}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{group.gaps.length}</span>
          </div>
          <ul>
            {group.gaps.map((g) => {
              const taskParams = new URLSearchParams({
                create: "1",
                gapKey: g.key,
                title: g.suggestedAction === "Assign an owner" ? `${g.title}: assign an owner` : g.title,
                description: g.explanation,
                priority: g.severity,
                ...(g.controlIds.length ? { controlId: g.controlIds.join(",") } : {}),
              });
              const riskParams = new URLSearchParams({
                gapKey: g.key,
                title: g.title,
                description: g.explanation,
                severity: g.severity,
                ...(g.controlIds.length ? { controlId: g.controlIds.join(",") } : {}),
              });
              return (
                <li key={g.key} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
                  <Status map={SEVERITY} value={g.severity} />
                  <div className="min-w-0 flex-1">
                    <Link href={`${org}${g.link}`} className="font-medium hover:underline">
                      {g.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{g.explanation}</p>
                  </div>
                  {g.trackedBy.length > 0 ? (
                    <span className="flex gap-1">
                      {g.trackedBy.map((t) => (
                        <Link key={t.id} href={`${org}/${t.kind === "task" ? "tasks" : "risks"}/${t.id}`} title="This gap is already tracked">
                          <StatusBadge tone="accent" label={`Tracked · ${t.label}`} />
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="flex gap-3">
                      {canCreateTask ? (
                        <Link href={`${org}/tasks?${taskParams.toString()}`} className="text-xs text-accent hover:underline">
                          Create task
                        </Link>
                      ) : null}
                      {canCreateRisk ? (
                        <Link href={`${org}/risks/new?${riskParams.toString()}`} className="text-xs text-accent hover:underline">
                          Track as risk
                        </Link>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

async function RegisterTab({ ctx, q }: { ctx: Awaited<ReturnType<typeof requireOrgContext>>; q: ReturnType<typeof riskListQuerySchema.parse> }) {
  const [data, members] = await Promise.all([listRisks(ctx, q), listMemberOptions(ctx)]);
  const base = `/org/${ctx.org.slug}/risks`;
  const query: Record<string, string | undefined> = Object.fromEntries(Object.entries({ ...q, tab: "register" }).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
  const href = makeQueryHref(base, query);
  const filtered = Boolean(q.status || q.severity || q.kind || q.owner || q.archived);
  return (
    <>
      <FilterBar>
        <FilterSelect param="status" label="Status" options={[{ value: "active", label: "Open or in progress" }, ...Object.entries(RISK_STATUS_LABELS).map(([value, label]) => ({ value, label }))]} />
        <FilterSelect param="severity" label="Severity" options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
        <FilterSelect param="kind" label="Kind" options={Object.entries(RISK_KIND_LABELS).map(([value, label]) => ({ value, label }))} />
        <FilterSelect param="owner" label="Owner" options={[{ value: "me", label: "Me" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
        <FilterLink href={href({ archived: q.archived ? null : "1", page: null })} active={q.archived === "1"}>
          Archived
        </FilterLink>
        <ClearFilters params={["status", "severity", "kind", "owner", "archived"]} />
      </FilterBar>
      {data.total === 0 ? (
        <EmptyState
          title={filtered ? "No risks match these filters" : "No risks recorded"}
          description={filtered ? "Adjust or clear the filters." : "Record risks to the security program, or track detected gaps as risks so they have an owner, a due date and a treatment plan."}
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th className="w-20">Key</Th>
                  <Th>Title</Th>
                  <Th>Kind</Th>
                  <Th>Severity</Th>
                  <Th>Status</Th>
                  <Th>Owner</Th>
                  <Th>Due</Th>
                  <Th>Controls</Th>
                </tr>
              </THead>
              <tbody>
                {data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="mono text-muted-foreground">{riskKey(r.number)}</Td>
                    <Td className="max-w-96">
                      <RowLink href={`${base}/${r.id}`} className="block truncate">
                        {r.title}
                      </RowLink>
                      {r.source === "DETECTED" ? <span className="text-xs text-muted-foreground">Tracks a detected gap</span> : null}
                    </Td>
                    <Td>{RISK_KIND_LABELS[r.kind]}</Td>
                    <Td>
                      <Status map={SEVERITY} value={r.severity} text />
                    </Td>
                    <Td>
                      <Status map={RISK_STATUS} value={r.status} text />
                    </Td>
                    <Td className="max-w-40">
                      <Person name={r.owner?.name} />
                    </Td>
                    <Td>
                      <DueDate date={r.dueDate} today={data.today} done={!(r.status === "OPEN" || r.status === "IN_PROGRESS")} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.controls.map((c) => (
                          <Link key={c.id} href={`/org/${ctx.org.slug}/controls/${c.id}`} className="mono rounded-sm border border-border px-1 text-[11px] text-muted-foreground hover:text-foreground">
                            {c.code}
                          </Link>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => href({ page: p })} />
        </>
      )}
    </>
  );
}
