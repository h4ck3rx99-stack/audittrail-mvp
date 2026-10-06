"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ErrorView({ reset, digest, homeHref = "/org" }: { reset: () => void; digest?: string; homeHref?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-md border border-border p-6 text-center">
      <h1 className="text-sm font-semibold">This page could not be loaded</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        An unexpected error occurred. Try again; if it continues, share the reference below with your administrator.
      </p>
      {digest ? <p className="mono mt-3 text-muted-foreground">Reference: {digest}</p> : null}
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild>
          <Link href={homeHref}>Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
