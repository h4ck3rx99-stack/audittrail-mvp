"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      next.delete("cursor");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, router],
  );
}

/** A select that writes its value to the URL (shareable filter state). */
export function FilterSelect({
  param,
  label,
  options,
  allLabel = "All",
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const params = useSearchParams();
  const setParam = useSetParam();
  const value = params.get(param) ?? "";
  return (
    <label className={cn("text-muted-foreground flex items-center gap-1.5 text-xs", className)}>
      <span className="whitespace-nowrap">{label}</span>
      <Select
        value={value}
        onChange={(e) => setParam({ [param]: e.target.value || null })}
        className="h-7 w-auto min-w-28 text-xs"
        aria-label={label}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Debounced text search bound to the `q` URL parameter. */
export function SearchFilter({
  placeholder = "Search…",
  param = "q",
}: {
  placeholder?: string;
  param?: string;
}) {
  const params = useSearchParams();
  const setParam = useSetParam();
  const current = params.get(param) ?? "";
  const [value, setValue] = React.useState(current);
  React.useEffect(() => {
    if (value.trim() === current) return;
    const id = window.setTimeout(() => setParam({ [param]: value.trim() || null }), 300);
    return () => window.clearTimeout(id);
  }, [value, current, param, setParam]);
  return (
    <div className="relative">
      <Search
        className="text-faint-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={100}
        className="border-input bg-background focus-visible:outline-ring h-7 w-56 rounded-sm border pr-7 pl-7 text-xs focus-visible:outline-2"
      />
      {value ? (
        <button
          className="text-faint-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2"
          aria-label="Clear search"
          onClick={() => setValue("")}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function ClearFilters({ params: keys }: { params: string[] }) {
  const params = useSearchParams();
  const setParam = useSetParam();
  const active = keys.some((k) => params.get(k));
  if (!active) return null;
  return (
    <button
      className="text-accent text-xs hover:underline"
      onClick={() => setParam(Object.fromEntries(keys.map((k) => [k, null])))}
    >
      Clear filters
    </button>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}
