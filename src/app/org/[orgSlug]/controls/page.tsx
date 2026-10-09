import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { listControls } from "@/features/controls/server/queries";
import { listMemberOptions } from "@/features/members/server/service";
import {
  controlListQuerySchema,
  CONTROL_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/features/controls/schemas";
import { ControlsTable } from "@/features/controls/components/controls-table";
import {
  EmptyState,
  FilterLink,
  PageHeader,
  Pagination,
  makeQueryHref,
} from "@/components/app/primitives";
import { ClearFilters, FilterBar, FilterSelect, SearchFilter } from "@/components/app/filters";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Controls" };

const FILTER_KEYS = ["q", "status", "health", "owner", "group", "priority", "overdue", "archived"];

export default async function ControlsPage({
  params,
  searchParams,
}: PageProps<"/org/[orgSlug]/controls">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const raw = await searchParams;
  const q = controlListQuerySchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const [data, members] = await Promise.all([listControls(ctx, q), listMemberOptions(ctx)]);
  const base = `/org/${ctx.org.slug}/controls`;
  const query: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
  );
  const href = makeQueryHref(base, query);
  const canManage = can(ctx, "control.manage");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Controls"
        description="Your safeguards, each mapped to the criteria it satisfies. Health combines status, required evidence and review timing."
        actions={
          canManage ? (
            <Button asChild variant="primary">
              <Link href={`${base}/new`}>
                <Plus />
                New control
              </Link>
            </Button>
          ) : null
        }
      />
      <FilterBar>
        <SearchFilter placeholder="Search code, name or criterion" />
        <FilterSelect
          param="status"
          label="Status"
          options={Object.entries(CONTROL_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          param="health"
          label="Health"
          options={[
            { value: "READY", label: "Ready" },
            { value: "ATTENTION", label: "Attention" },
            { value: "NOT_READY", label: "Not ready" },
          ]}
        />
        <FilterSelect
          param="owner"
          label="Owner"
          options={[
            { value: "me", label: "Me" },
            { value: "unassigned", label: "Unassigned" },
            ...members.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <FilterSelect
          param="group"
          label="Category"
          options={data.groups.map((g) => ({
            value: g.code,
            label: g.topLevel ? g.title : `${g.code} · ${g.title}`,
          }))}
        />
        <FilterSelect
          param="priority"
          label="Priority"
          options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <FilterLink
          href={href({ overdue: q.overdue ? null : "1", page: null })}
          active={q.overdue === "1"}
        >
          Review overdue
        </FilterLink>
        <FilterLink
          href={href({ archived: q.archived ? null : "1", page: null })}
          active={q.archived === "1"}
        >
          Archived
        </FilterLink>
        <ClearFilters params={FILTER_KEYS} />
      </FilterBar>

      {!data.hasFramework ? (
        <EmptyState
          title="No framework adopted"
          description="Controls map to framework criteria. Adopt SOC 2 to start with a starter control set, or start empty and create your own."
          action={
            <Link
              href={`/org/${ctx.org.slug}/settings/frameworks`}
              className="text-accent text-[13px] hover:underline"
            >
              Adopt a framework
            </Link>
          }
        />
      ) : data.total === 0 ? (
        <EmptyState
          title={
            Object.values(q).some(Boolean) ? "No controls match these filters" : "No controls yet"
          }
          description={
            Object.values(q).some(Boolean)
              ? "Adjust or clear the filters to see more controls."
              : "Controls are the safeguards auditors test. Create one, or adopt the starter control set from Settings → Frameworks."
          }
          action={
            canManage && !Object.values(q).some(Boolean) ? (
              <Link href={`${base}/new`} className="text-accent text-[13px] hover:underline">
                Create a control
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ControlsTable
            rows={data.rows}
            today={data.today}
            orgSlug={ctx.org.slug}
            selectable={canManage}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            query={query}
          />
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            href={(p) => href({ page: p })}
          />
        </>
      )}
    </div>
  );
}
