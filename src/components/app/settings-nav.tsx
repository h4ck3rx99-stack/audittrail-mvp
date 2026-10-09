"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="border-border mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b"
      aria-label="Settings sections"
    >
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-9 items-center border-b-2 px-2.5 text-[13px] whitespace-nowrap",
              active
                ? "border-accent text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
