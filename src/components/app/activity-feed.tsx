import Link from "next/link";
import { Avatar, TimeAgo } from "./primitives";

export type FeedEvent = {
  id: string;
  actorName: string | null;
  actorType: "USER" | "SYSTEM";
  summary: string;
  occurredAt: Date;
  resourceType: string;
  resourceId: string | null;
  sequence: string;
};

/** Renders audit events (the only source of activity) through the shared describe formatter. */
export function ActivityFeed({
  events,
  links,
  timeZone,
  empty = "No activity yet.",
}: {
  events: FeedEvent[];
  links?: Map<string, string>;
  timeZone: string;
  empty?: string;
}) {
  if (events.length === 0) return <p className="text-muted-foreground py-4 text-[13px]">{empty}</p>;
  return (
    <ol className="flex flex-col">
      {events.map((e) => {
        const href = e.resourceId ? links?.get(`${e.resourceType}:${e.resourceId}`) : undefined;
        return (
          <li key={e.id} className="border-border flex gap-2.5 border-b py-2.5 last:border-0">
            <Avatar name={e.actorType === "SYSTEM" ? "System" : e.actorName} className="mt-0.5" />
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="break-words">
                <span className="font-medium">{e.actorName ?? "System"}</span>{" "}
                {href ? (
                  <Link href={href} className="text-foreground hover:underline">
                    {e.summary}
                  </Link>
                ) : (
                  <span>{e.summary}</span>
                )}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                <TimeAgo date={e.occurredAt} timeZone={timeZone} /> ·{" "}
                <span className="mono">#{e.sequence}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
