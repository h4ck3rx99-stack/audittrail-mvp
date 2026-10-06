"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Search } from "lucide-react";
import { searchAction } from "@/features/search/actions";
import type { SearchHit, SearchResults } from "@/features/search/server/service";

const GROUP_LABELS: Record<keyof SearchResults, string> = {
  controls: "Controls",
  requirements: "Requirements",
  evidence: "Evidence",
  tasks: "Tasks",
  risks: "Risks",
  members: "Members",
};

export function CommandPalette({
  open,
  onOpenChange,
  slug,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  permissions: { canManageSettings: boolean; canCreateTask: boolean; canUploadEvidence: boolean; canManageControls: boolean };
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const base = `/org/${slug}`;

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
      setError(null);
    }
  }, [open]);

  // Debounced server search (minimum 2 characters).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(async () => {
      const r = await searchAction(slug, q);
      if (cancelled) return;
      setLoading(false);
      if (r.ok) {
        setResults(r.data);
        setError(null);
      } else {
        setError(r.error.message);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, slug]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const navigation = [
    { label: "Go to Dashboard", href: `${base}/dashboard` },
    { label: "Go to Frameworks", href: `${base}/frameworks` },
    { label: "Go to Controls", href: `${base}/controls` },
    { label: "Go to Evidence", href: `${base}/evidence` },
    { label: "Go to Tasks", href: `${base}/tasks` },
    { label: "Go to Risks & Gaps", href: `${base}/risks` },
    { label: "Go to Audit log", href: `${base}/audit-log` },
    { label: "Go to Settings", href: `${base}/settings` },
  ];
  const actions = [
    permissions.canCreateTask ? { label: "Create task", href: `${base}/tasks?create=1` } : null,
    permissions.canUploadEvidence ? { label: "Upload evidence", href: `${base}/evidence/new` } : null,
    permissions.canManageControls ? { label: "Create control", href: `${base}/controls/new` } : null,
    { label: "View missing evidence", href: `${base}/evidence?tab=missing` },
    { label: "View detected gaps", href: `${base}/risks?tab=gaps` },
  ].filter((a): a is { label: string; href: string } => a !== null);

  const groups = results ? (Object.keys(GROUP_LABELS) as (keyof SearchResults)[]).filter((k) => results[k].length > 0) : [];
  const itemClass = "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] data-[selected=true]:bg-hover";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-md border border-border bg-surface">
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Search controls, evidence, tasks, risks, requirements and members, or run a command.</D.Description>
          <Command shouldFilter={!results} label="Search and commands">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search or type a command…"
                className="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint-foreground"
              />
              {loading ? <span className="text-xs text-muted-foreground">Searching…</span> : null}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              {error ? <p className="px-2 py-3 text-xs text-danger">{error}</p> : null}
              <Command.Empty className="px-2 py-6 text-center text-xs text-muted-foreground">
                {query.trim().length < 2 ? "Type at least 2 characters to search." : "No results."}
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g} heading={GROUP_LABELS[g]} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-faint-foreground">
                  {results![g].map((hit: SearchHit) => (
                    <Command.Item key={`${g}-${hit.id}`} value={`${g}-${hit.id}-${hit.title}`} onSelect={() => go(hit.href)} className={itemClass}>
                      <span className="truncate">{hit.title}</span>
                      {hit.subtitle ? <span className="ml-auto truncate text-xs text-muted-foreground">{hit.subtitle}</span> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              {results && query.trim().length >= 2 ? (
                <Command.Item value="see-all" onSelect={() => go(`${base}/search?q=${encodeURIComponent(query.trim())}`)} className={itemClass}>
                  See all results for “{query.trim()}”
                </Command.Item>
              ) : null}
              {!results ? (
                <>
                  <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-faint-foreground">
                    {actions.map((a) => (
                      <Command.Item key={a.href} value={a.label} onSelect={() => go(a.href)} className={itemClass}>
                        {a.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-faint-foreground">
                    {navigation.map((n) => (
                      <Command.Item key={n.href} value={n.label} onSelect={() => go(n.href)} className={itemClass}>
                        {n.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              ) : null}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
