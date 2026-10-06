import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { describeDueDate, formatDateOnly, formatRelative, formatTimestamp, type DateOnly } from "@/lib/dates";

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-md border border-border bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong px-6 py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-subtle text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      {initials(name ?? "?")}
    </span>
  );
}

export function Person({ name, empty = "Unassigned" }: { name: string | null | undefined; empty?: string }) {
  if (!name) return <span className="text-faint-foreground">{empty}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={name} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Date-only due date: relative label, absolute date in the tooltip, danger color when overdue. */
export function DueDate({ date, today, done, empty = "—" }: { date: DateOnly | null; today: DateOnly; done?: boolean; empty?: string }) {
  if (!date) return <span className="text-faint-foreground">{empty}</span>;
  const d = describeDueDate(date, today);
  return (
    <time dateTime={date} title={formatDateOnly(date)} className={cn("whitespace-nowrap", d.overdue && !done ? "font-medium text-danger" : "")}>
      {done ? formatDateOnly(date) : d.label}
    </time>
  );
}

export function TimeAgo({ date, timeZone, now }: { date: Date; timeZone: string; now?: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatTimestamp(date, timeZone)} className="whitespace-nowrap">
      {formatRelative(date, now)}
    </time>
  );
}

/** User-supplied text: rendered as plain text with preserved line breaks. Never as HTML. */
export function PlainText({ text, empty = "—", className }: { text: string | null | undefined; empty?: string; className?: string }) {
  if (!text) return <p className={cn("text-faint-foreground", className)}>{empty}</p>;
  return <p className={cn("break-words whitespace-pre-wrap", className)}>{text}</p>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm border border-border-strong px-1 font-mono text-[11px] text-muted-foreground">{children}</kbd>;
}

// ─── Tables ─────────────────────────────────────────────────────────────────

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-md border border-border bg-surface", className)}>{children}</div>;
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />;
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-subtle">{children}</thead>;
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("h-9 border-b border-border px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-10 border-b border-border px-3 align-middle last:pr-4", className)} {...props} />;
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors duration-100 hover:bg-hover [&:last-child>td]:border-b-0", className)} {...props} />;
}

/** A link that covers its row cell (keeps rows keyboard-navigable with real anchors). */
export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-foreground hover:underline", className)}>
      {children}
    </Link>
  );
}

export function SortHeader({
  label,
  field,
  sort,
  dir,
  href,
  className,
}: {
  label: string;
  field: string;
  sort: string;
  dir: "asc" | "desc";
  href: (field: string, dir: "asc" | "desc") => string;
  className?: string;
}) {
  const active = sort === field;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href(field, nextDir)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={cn("size-3.5", active ? "text-foreground" : "text-faint-foreground")} aria-hidden />
      </Link>
    </Th>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link className="rounded-sm border border-border px-2 py-1 hover:bg-hover hover:text-foreground" href={href(page - 1)}>
            Previous
          </Link>
        ) : (
          <span className="rounded-sm border border-border px-2 py-1 opacity-50">Previous</span>
        )}
        {page < pages ? (
          <Link className="rounded-sm border border-border px-2 py-1 hover:bg-hover hover:text-foreground" href={href(page + 1)}>
            Next
          </Link>
        ) : (
          <span className="rounded-sm border border-border px-2 py-1 opacity-50">Next</span>
        )}
      </div>
    </div>
  );
}

/** Builds hrefs that change a few query params while keeping the rest (shareable URL state). */
export function makeQueryHref(basePath: string, current: Record<string, string | undefined>) {
  return (changes: Record<string, string | number | undefined | null>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) if (v !== undefined && v !== "") params.set(k, v);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === null || v === "") params.delete(k);
      else params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
}

export function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs whitespace-nowrap",
        active ? "border-accent bg-accent-subtle text-foreground" : "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function TabLinks({ tabs }: { tabs: { href: string; label: React.ReactNode; active: boolean }[] }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13px] whitespace-nowrap",
            t.active ? "border-accent font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Meter({ value, label, tone = "accent" }: { value: number | null; label?: string; tone?: "accent" | "success" | "warning" | "danger" }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-label={label}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MetaList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
      {items.map((i) => (
        <React.Fragment key={i.label}>
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0">{i.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-hover", className)} />;
}

export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-6 w-48" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="rounded-md border border-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-0">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
