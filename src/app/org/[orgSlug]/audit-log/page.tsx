import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { auditLogQuerySchema, listAuditActors, listAuditEvents } from "@/features/audit/server/service";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { AUDIT_CATEGORY_LABELS, RESOURCE_TYPE_LABELS } from "@/server/audit/catalog";
import { EmptyState, PageHeader, Panel, SectionTitle, TableWrap, Table, Td, Th, THead, Tr, TimeAgo } from "@/components/app/primitives";
import { ClearFilters, FilterBar, FilterSelect } from "@/components/app/filters";
import { EventDrawer, VerifyPanel } from "@/features/audit/components/audit-components";
import { DateRangeFilter } from "@/features/audit/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({ params, searchParams }: PageProps<"/org/[orgSlug]/audit-log">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const raw = await searchParams;
  const q = auditLogQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const [{ items, nextCursor }, actors] = await Promise.all([listAuditEvents(ctx, q), listAuditActors(ctx)]);
  const links = await resolveResourceLinks(ctx, items);
  const showContext = can(ctx, "auditLog.viewRequestContext");
  const canExport = can(ctx, "auditLog.export");
  const canVerify = can(ctx, "auditLog.verify");
  const base = `/org/${ctx.org.slug}/audit-log`;
  const filterParams = new URLSearchParams();
  for (const k of ["actor", "category", "resourceType", "from", "to"] as const) if (q[k]) filterParams.set(k, q[k]!);
  const nextHref = nextCursor ? `${base}?${new URLSearchParams({ ...Object.fromEntries(filterParams), cursor: nextCursor }).toString()}` : null;
  const filtered = filterParams.toString().length > 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Audit log"
        description="Every meaningful action, recorded in the same transaction as the change and linked into a tamper-evident hash chain. Newest first."
        actions={
          canExport ? (
            <Button asChild>
              <a href={`/api/org/${ctx.org.slug}/audit-log/export${filtered ? `?${filterParams.toString()}` : ""}`}>
                <Download />
                Export CSV
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <FilterBar>
            <FilterSelect param="actor" label="Actor" options={actors.map((a) => ({ value: a.actorUserId, label: a.actorName ?? a.actorUserId }))} />
            <FilterSelect param="category" label="Action" options={Object.entries(AUDIT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
            <FilterSelect param="resourceType" label="Resource" options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            <DateRangeFilter />
            <ClearFilters params={["actor", "category", "resourceType", "from", "to"]} />
          </FilterBar>
          {items.length === 0 ? (
            <EmptyState title={filtered ? "No events match these filters" : "No events yet"} description="Events appear here as soon as anyone changes anything in this organization." />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <Th className="w-28">Time</Th>
                      <Th>Actor</Th>
                      <Th>Action</Th>
                      <Th>Resource</Th>
                      <Th className="w-16 text-right">Seq</Th>
                      <Th className="w-16" />
                    </tr>
                  </THead>
                  <tbody>
                    {items.map((e) => {
                      const href = e.resourceId ? links.get(`${e.resourceType}:${e.resourceId}`) : undefined;
                      return (
                        <Tr key={e.id}>
                          <Td className="text-muted-foreground">
                            <TimeAgo date={e.occurredAt} timeZone={ctx.org.timezone} />
                          </Td>
                          <Td className="max-w-48">
                            <span className="block truncate font-medium">{e.actorName ?? "System"}</span>
                            {e.actorRole ? <span className="text-xs text-muted-foreground">{e.actorRole.charAt(0) + e.actorRole.slice(1).toLowerCase()}</span> : null}
                          </Td>
                          <Td className="max-w-md">
                            <span className="block truncate">{e.summary}</span>
                            <span className="mono text-[11px] text-faint-foreground">{e.action}</span>
                          </Td>
                          <Td className="max-w-56">
                            {href ? (
                              <Link href={href} className="block truncate hover:underline">
                                {e.resourceLabel ?? e.resourceType}
                              </Link>
                            ) : (
                              <span className="block truncate text-muted-foreground">{e.resourceLabel ?? e.resourceType}</span>
                            )}
                          </Td>
                          <Td className="mono text-right text-muted-foreground">{e.sequence}</Td>
                          <Td>
                            <EventDrawer
                              showContext={showContext}
                              event={{
                                id: e.id,
                                sequence: e.sequence,
                                occurredAtLabel: formatTimestamp(e.occurredAt, ctx.org.timezone),
                                occurredAtIso: e.occurredAt.toISOString(),
                                actorName: e.actorName,
                                actorEmail: e.actorEmail,
                                actorRole: e.actorRole,
                                actorType: e.actorType,
                                action: e.action,
                                summary: e.summary,
                                resourceType: e.resourceType,
                                resourceId: e.resourceId,
                                resourceLabel: e.resourceLabel,
                                changes: e.changes,
                                metadata: e.metadata,
                                ipAddress: e.ipAddress,
                                userAgent: e.userAgent,
                                requestId: e.requestId,
                                prevHash: e.prevHash,
                                hash: e.hash,
                              }}
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <div className="flex items-center justify-between px-1 py-2 text-xs text-muted-foreground">
                <span>Showing {items.length} events</span>
                <span className="flex gap-2">
                  {q.cursor ? (
                    <Link href={filtered ? `${base}?${filterParams.toString()}` : base} className="rounded-sm border border-border px-2 py-1 hover:bg-hover">
                      Newest
                    </Link>
                  ) : null}
                  {nextHref ? (
                    <Link href={nextHref} className="rounded-sm border border-border px-2 py-1 hover:bg-hover">
                      Older
                    </Link>
                  ) : null}
                </span>
              </div>
            </>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          {canVerify ? (
            <Panel className="p-4">
              <SectionTitle>Verify integrity</SectionTitle>
              <VerifyPanel orgSlug={ctx.org.slug} />
            </Panel>
          ) : null}
          <Panel className="p-4 text-[13px] text-muted-foreground">
            <SectionTitle>About this log</SectionTitle>
            <p>Events cannot be edited or deleted: the database rejects updates and deletes on this table.</p>
            <p className="mt-2">IP addresses and user agents are visible to Owners and Admins only.</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
