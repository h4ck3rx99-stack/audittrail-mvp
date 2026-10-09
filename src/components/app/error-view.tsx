"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ErrorView({
  reset,
  digest,
  homeHref = "/org",
}: {
  reset: () => void;
  digest?: string;
  homeHref?: string;
}) {
  return (
    <div className="border-border mx-auto mt-16 max-w-md rounded-md border p-6 text-center">
      <h1 className="text-sm font-semibold">This page could not be loaded</h1>
      <p className="text-muted-foreground mt-1 text-[13px]">
        An unexpected error occurred. Try again; if it continues, share the reference below with
        your administrator.
      </p>
      {digest ? <p className="mono text-muted-foreground mt-3">Reference: {digest}</p> : null}
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
