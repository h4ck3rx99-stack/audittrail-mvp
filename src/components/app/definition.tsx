"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";

/** A small "how is this defined?" popover next to computed metrics. */
export function Definition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label={`How is ${label} defined?`}>
          <Info className="size-3.5" aria-hidden />
          <span className="underline decoration-dotted underline-offset-2">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-[13px] leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}

export function ReadinessDefinition() {
  return (
    <Definition label="Internal readiness estimate · not an audit opinion">
      <p className="font-medium">How readiness is calculated</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
        <li>
          <span className="text-foreground">Applicable controls</span> are not archived, not marked not applicable, and mapped to at least one in-scope
          criterion.
        </li>
        <li>
          A control is <span className="text-foreground">Ready</span> when it is implemented, every required evidence requirement has approved,
          unexpired evidence, and its review is not overdue.
        </li>
        <li>
          <span className="text-foreground">Readiness</span> = Ready controls ÷ applicable controls. With no applicable controls it shows “—”.
        </li>
        <li>
          <span className="text-foreground">Evidence coverage</span> = satisfied required evidence requirements ÷ all required evidence requirements on
          applicable controls.
        </li>
      </ul>
      <p className="mt-2 text-muted-foreground">
        This is an internal estimate to guide preparation. Only an independent CPA firm can issue a SOC 2 report.
      </p>
    </Definition>
  );
}
