"use client";

import * as React from "react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import { CopyButton } from "@/components/app/actions";
import { verifyAuditChainAction, type VerifyResult } from "../actions";

export type DrawerEvent = {
  id: string;
  sequence: string;
  occurredAtLabel: string;
  occurredAtIso: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actorType: string;
  action: string;
  summary: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  changes: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  prevHash: string | null;
  hash: string;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border grid grid-cols-[110px_1fr] gap-3 border-b py-2 text-[13px] last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "")
    return <span className="text-faint-foreground">none</span>;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return <span>{String(v)}</span>;
  return <pre className="mono text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>;
}

export function EventDrawer({ event, showContext }: { event: DrawerEvent; showContext: boolean }) {
  const changes =
    event.changes && typeof event.changes === "object"
      ? (event.changes as Record<string, { from: unknown; to: unknown }>)
      : null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Details for event ${event.sequence}`}>
          Details
        </Button>
      </DialogTrigger>
      <SheetContent
        title={`Event #${event.sequence}`}
        description={event.summary}
        className="max-w-xl"
      >
        <dl>
          <Row label="When">
            <time dateTime={event.occurredAtIso}>{event.occurredAtLabel}</time>
          </Row>
          <Row label="Actor">
            {event.actorName ?? "System"}
            {event.actorEmail ? (
              <span className="text-muted-foreground"> · {event.actorEmail}</span>
            ) : null}
            {event.actorRole ? (
              <span className="text-muted-foreground"> · {event.actorRole}</span>
            ) : null}
          </Row>
          <Row label="Action">
            <span className="mono">{event.action}</span>
          </Row>
          <Row label="Resource">
            {event.resourceType}
            {event.resourceLabel ? ` · ${event.resourceLabel}` : ""}
            {event.resourceId ? (
              <span className="mono text-muted-foreground block text-xs">{event.resourceId}</span>
            ) : null}
          </Row>
          {changes && Object.keys(changes).length > 0 ? (
            <Row label="Changes">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="pb-1 font-medium">Field</th>
                    <th className="pb-1 font-medium">Before</th>
                    <th className="pb-1 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changes).map(([field, c]) => (
                    <tr key={field} className="align-top">
                      <td className="mono pr-2 pb-1">{field}</td>
                      <td className="text-danger pr-2 pb-1">
                        <Value v={c?.from} />
                      </td>
                      <td className="text-success pb-1">
                        <Value v={c?.to} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Row>
          ) : null}
          {event.metadata ? (
            <Row label="Metadata">
              <Value v={event.metadata} />
            </Row>
          ) : null}
          <Row label="Request ID">
            <span className="mono text-xs">{event.requestId ?? "—"}</span>
          </Row>
          {showContext ? (
            <>
              <Row label="IP address">
                <span className="mono text-xs">{event.ipAddress ?? "Unknown"}</span>
              </Row>
              <Row label="User agent">
                <span className="text-xs">{event.userAgent ?? "Unknown"}</span>
              </Row>
            </>
          ) : null}
          <Row label="Sequence">
            <span className="mono">{event.sequence}</span>
          </Row>
          <Row label="Previous hash">
            <span className="mono block text-xs break-all">
              {event.prevHash ?? "— (first event)"}
            </span>
          </Row>
          <Row label="Hash">
            <span className="mono block text-xs break-all">{event.hash}</span>
            <div className="mt-1">
              <CopyButton value={event.hash} label="Copy hash" />
            </div>
          </Row>
        </dl>
      </SheetContent>
    </Dialog>
  );
}

export function VerifyPanel({ orgSlug }: { orgSlug: string }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<VerifyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-[13px]">
        Recomputes the SHA-256 hash of every event in this organization&apos;s chain and checks
        sequence continuity and links. This makes tampering detectable, not impossible: someone with
        direct database superuser access could rewrite the whole chain.
      </p>
      <Button
        variant="primary"
        className="self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await verifyAuditChainAction(orgSlug);
            if (r.ok) setResult(r.data);
            else setError(r.error.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Verifying…" : "Verify integrity"}
      </Button>
      {error ? <p className="text-danger text-[13px]">{error}</p> : null}
      {result ? (
        result.valid ? (
          <div className="border-border rounded-sm border p-3 text-[13px]" role="status">
            <p className="text-success flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4" aria-hidden /> Chain intact
            </p>
            <p className="text-muted-foreground mt-1">{result.eventCount} events verified.</p>
            {result.headHash ? (
              <p className="mono text-muted-foreground mt-1 break-all">Head {result.headHash}</p>
            ) : null}
          </div>
        ) : (
          <div
            className="border-danger/50 bg-danger-subtle rounded-sm border p-3 text-[13px]"
            role="alert"
          >
            <p className="text-danger flex items-center gap-2 font-medium">
              <ShieldX className="size-4" aria-hidden /> Integrity check failed
            </p>
            <p className="mt-1">
              First broken sequence: <span className="mono">{result.brokenAtSequence}</span>
            </p>
            <p className="text-muted-foreground mt-1">{result.reason}</p>
          </div>
        )
      ) : null}
    </div>
  );
}
