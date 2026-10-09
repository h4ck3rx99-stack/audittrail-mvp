"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** From/to date inputs bound to the URL (dates are interpreted in the organization's timezone). */
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <label className="flex items-center gap-1.5">
        From
        <input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value)}
          className="border-input bg-background text-foreground h-7 rounded-sm border px-1.5 text-xs"
        />
      </label>
      <label className="flex items-center gap-1.5">
        To
        <input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value)}
          className="border-input bg-background text-foreground h-7 rounded-sm border px-1.5 text-xs"
        />
      </label>
    </span>
  );
}
