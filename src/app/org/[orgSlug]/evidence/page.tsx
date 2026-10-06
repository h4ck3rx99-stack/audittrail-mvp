import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { getEvidenceFilterOptions, listEvidence, listMissingEvidence } from "@/features/evidence/server/queries";
import { listMemberOptions } from "@/features/members/server/service";
import { evidenceListQuerySchema, EVIDENCE_CATEGORY_LABELS } from "@/features/evidence/schemas";
import { EmptyState, PageHeader, Pagination, Person, RowLink, TabLinks, Table, TableWrap, Td, Th, THead, Tr, makeQueryHref } from "@/components/app/primitives";
import { EVIDENCE_STATUS, FRESHNESS, PRIORITY, REQUIREMENT_STATE, Status } from "@/components/app/status";
import { ClearFilters, FilterBar, FilterSelect, SearchFilter } from "@/components/app/filters";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";

export const metadata: Metadata = { title: "Evidence" };

export default async function EvidencePage({ params, searchParams }: PageProps<"/org/[orgSlug]/evidence">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const raw = await searchParams;
  const q = evidenceListQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const tab = q.tab ?? "all";
  const base = `/org/${ctx.org.slug}/evidence`;
  const query: Record<string, string | undefined> = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
  const href = makeQueryHref(base, query);
  const canUpload = can(ctx, "evidence.contribute");

  const [{ pendingCount, controls }, members] = await Promise.all([getEvidenceFilterOptions(ctx), listMemberOptions(ctx)]);

  const tabs = [
    { key: "all", label: "All" },
    { key: "review", label: `Needs review${pendingCount ? ` · ${pendingCount}` : ""}` },
    { key: "missing", label: "Missing" },
    { key: "expiring", label: "Expiring & expired" },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Evidence"
        description="Proof that controls operate. Each item can support many controls; approved, unexpired evidence satisfies a requirement."
        actions={
          canUpload ? (
            <Button asChild variant="primary">
              <Link href={`${base}/new`}>
                <Upload />
                Upload evidence
              </Link>
            </Button>
          ) : null
        }
      />
      <TabLinks tabs={tabs.map((t) => ({ href: t.key === "all" ? base : `${base}?tab=${t.key}`, label: t.label, active: tab === t.key }))} />

      {tab === "missing" ? <MissingTab orgSlug={ctx.org.slug} ctx={ctx} canUpload={canUpload} /> : (
        <>
          <FilterBar>
            <SearchFilter placeholder="Search title or description" />
            {tab === "all" ? (
              <FilterSelect param="status" label="Status" options={Object.entries(EVIDENCE_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
            ) : null}
            <FilterSelect param="category" label="Category" options={Object.entries(EVIDENCE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
            <FilterSelect param="control" label="Control" options={controls.map((c) => ({ value: c.id, label: c.code }))} />
            <FilterSelect param="uploader" label="Uploader" options={[{ value: "me", label: "Me" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
            <FilterSelect param="freshness" label="Freshness" options={Object.entries(FRESHNESS).map(([value, v]) => ({ value, label: v.label }))} />
            <ClearFilters params={["q", "status", "category", "control", "uploader", "freshness"]} />
          </FilterBar>
          <EvidenceTable ctx={ctx} q={q} href={href} />
        </>
      )}
    </div>
  );
}

async function EvidenceTable({
  ctx,
  q,
  href,
}: {
  ctx: Awaited<ReturnType<typeof requireOrgContext>>;
  q: ReturnType<typeof evidenceListQuerySchema.parse>;
  href: ReturnType<typeof makeQueryHref>;
}) {
  const data = await listEvidence(ctx, q);
  const base = `/org/${ctx.org.slug}`;
  const filtered = Boolean(q.q || q.status || q.category || q.control || q.uploader || q.freshness);
  if (data.total === 0) {
    if (q.tab === "review") return <EmptyState title="Nothing waiting for review" description="New uploads and new versions appear here until an Owner or Admin approves or rejects them." />;
    if (q.tab === "expiring") return <EmptyState title="No evidence is expiring" description="Approved evidence appears here 30 days before its validity date, and stays here once expired." />;
    return (
      <EmptyState
        title={filtered ? "No evidence matches these filters" : "No evidence yet"}
        description={
          filtered
            ? "Adjust or clear the filters."
            : "Evidence is the proof auditors review: screenshots, exports, policies, reports. Start with what's missing."
        }
        action={!filtered ? <Link href={`${base}/evidence?tab=missing`} className="text-[13px] text-accent hover:underline">View missing evidence</Link> : undefined}
      />
    );
  }
  return (
    <>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Freshness</Th>
              <Th>Controls</Th>
              <Th>Uploaded by</Th>
              <Th>Collected</Th>
              <Th>Valid until</Th>
            </tr>
          </THead>
          <tbody>
            {data.rows.map((e) => (
              <Tr key={e.id}>
                <Td className="max-w-80">
                  <RowLink href={`${base}/evidence/${e.id}`} className="block truncate">
                    {e.title}
                  </RowLink>
                  <span className="text-xs text-muted-foreground">
                    {e.kind === "LINK" ? "Link" : e.currentVersion ? `${e.currentVersion.originalFilename} · v${e.currentVersion.versionNumber}` : "File"}
                  </span>
                </Td>
                <Td>{EVIDENCE_CATEGORY_LABELS[e.category]}</Td>
                <Td>
                  <Status map={EVIDENCE_STATUS} value={e.status} text />
                </Td>
                <Td>{e.status === "APPROVED" ? <Status map={FRESHNESS} value={e.freshness} text /> : <span className="text-faint-foreground">—</span>}</Td>
                <Td className="max-w-48">
                  <div className="flex flex-wrap gap-1">
                    {e.controls.slice(0, 3).map((c) => (
                      <Link key={c.id} href={`${base}/controls/${c.id}?tab=evidence`} className="mono rounded-sm border border-border px-1 text-[11px] text-muted-foreground hover:text-foreground">
                        {c.code}
                      </Link>
                    ))}
                    {e.controls.length > 3 ? <span className="text-[11px] text-muted-foreground">+{e.controls.length - 3}</span> : null}
                    {e.controls.length === 0 ? <span className="text-xs text-faint-foreground">Not linked</span> : null}
                  </div>
                </Td>
                <Td className="max-w-40">
                  <Person name={e.uploadedBy.name} />
                </Td>
                <Td className="whitespace-nowrap">{formatDateOnly(e.collectedAt)}</Td>
                <Td className="whitespace-nowrap">{e.validUntil ? formatDateOnly(e.validUntil) : <span className="text-faint-foreground">—</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => href({ page: p })} />
    </>
  );
}

async function MissingTab({ orgSlug, ctx, canUpload }: { orgSlug: string; ctx: Awaited<ReturnType<typeof requireOrgContext>>; canUpload: boolean }) {
  const { rows } = await listMissingEvidence(ctx);
  const base = `/org/${orgSlug}`;
  if (rows.length === 0) {
    return <EmptyState title="Nothing missing" description="Every required evidence requirement on applicable controls has approved, current evidence." />;
  }
  return (
    <>
      <p className="mb-3 text-[13px] text-muted-foreground">{rows.length} required evidence requirements are not satisfied. This is your collection to-do list.</p>
      <TableWrap>
        <Table>
          <THead>
            <tr>
              <Th>Requirement</Th>
              <Th>Control</Th>
              <Th>State</Th>
              <Th>Priority</Th>
              <Th>Owner</Th>
              {canUpload ? <Th className="w-24" /> : null}
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.requirementId}>
                <Td className="max-w-80">
                  <span className="block truncate font-medium">{r.requirementTitle}</span>
                  <span className="text-xs text-muted-foreground">Fresh for {r.freshnessDays} days</span>
                </Td>
                <Td className="max-w-72">
                  <Link href={`${base}/controls/${r.controlId}?tab=evidence`} className="block truncate hover:underline">
                    <span className="mono mr-1.5 text-muted-foreground">{r.controlCode}</span>
                    {r.controlName}
                  </Link>
                </Td>
                <Td>
                  <Status map={REQUIREMENT_STATE} value={r.state} text />
                </Td>
                <Td>
                  <Status map={PRIORITY} value={r.priority} text />
                </Td>
                <Td>
                  <Person name={r.ownerName} />
                </Td>
                {canUpload ? (
                  <Td>
                    <Link href={`${base}/evidence/new?controlId=${r.controlId}&requirementId=${r.requirementId}`} className="text-xs text-accent hover:underline">
                      Upload
                    </Link>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
