import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/authz/context";
import { isAppError } from "@/server/errors";
import {
  SEARCH_MIN_LENGTH,
  searchOrganization,
  type SearchResults,
} from "@/features/search/server/service";
import { EmptyState, PageHeader, TabLinks } from "@/components/app/primitives";
import { SearchFilter } from "@/components/app/filters";

export const metadata: Metadata = { title: "Search" };

const GROUPS: { key: keyof SearchResults; label: string }[] = [
  { key: "controls", label: "Controls" },
  { key: "requirements", label: "Requirements" },
  { key: "evidence", label: "Evidence" },
  { key: "tasks", label: "Tasks" },
  { key: "risks", label: "Risks" },
  { key: "members", label: "Members" },
];

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/org/[orgSlug]/search">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const query = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const type = GROUPS.some((g) => g.key === sp.type) ? (sp.type as keyof SearchResults) : null;
  let results: SearchResults | null = null;
  let error: string | null = null;
  if (query.trim().length >= SEARCH_MIN_LENGTH) {
    try {
      results = await searchOrganization(ctx, query, { perGroup: 50 });
    } catch (e) {
      if (isAppError(e)) error = e.message;
      else throw e;
    }
  }
  const base = `/org/${ctx.org.slug}/search`;
  const total = results ? GROUPS.reduce((n, g) => n + results![g.key].length, 0) : 0;
  const shown = results
    ? GROUPS.filter((g) => (!type || g.key === type) && results![g.key].length > 0)
    : [];

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="Search"
        description="Controls, requirements, evidence, tasks, risks and members in this organization."
      />
      <div className="mb-4">
        <SearchFilter placeholder="Search…" />
      </div>
      {results ? (
        <TabLinks
          tabs={[
            {
              href: `${base}?q=${encodeURIComponent(query)}`,
              label: `All ${total}`,
              active: !type,
            },
            ...GROUPS.map((g) => ({
              href: `${base}?q=${encodeURIComponent(query)}&type=${g.key}`,
              label: `${g.label} ${results![g.key].length}`,
              active: type === g.key,
            })),
          ]}
        />
      ) : null}
      {error ? <p className="text-danger text-[13px]">{error}</p> : null}
      {!results && !error ? (
        <EmptyState
          title="Type at least 2 characters"
          description="Tip: press Ctrl+K anywhere to search without leaving the page."
        />
      ) : results && total === 0 ? (
        <EmptyState
          title={`No results for “${query}”`}
          description="Try a control code (AC-01), a criterion (CC6.1), a task key (TSK-12) or part of a title."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {shown.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-semibold">{g.label}</h2>
              <ul className="border-border rounded-md border">
                {results![g.key].map((hit) => (
                  <li key={hit.id} className="border-border border-b last:border-0">
                    <Link
                      href={hit.href}
                      className="hover:bg-hover flex items-center gap-3 px-3 py-2 text-[13px]"
                    >
                      <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="text-muted-foreground text-xs">{hit.subtitle}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
