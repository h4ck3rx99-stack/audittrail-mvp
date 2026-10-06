import { cn } from "@/lib/utils";

/**
 * Status visualization, defined once: a colored dot plus a text label (color is never the only
 * signal). Every status-like value in the app renders through these mappings.
 */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent" | "muted";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
  accent: "bg-accent",
  muted: "bg-border-strong",
};

const TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted-foreground",
  accent: "text-accent",
  muted: "text-faint-foreground",
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT[tone], className)} />;
}

export function StatusBadge({ tone, label, className, title }: { tone: Tone; label: string; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-5 items-center gap-1.5 rounded-sm border border-border px-1.5 text-xs whitespace-nowrap text-foreground", className)}
    >
      <Dot tone={tone} />
      {label}
    </span>
  );
}

/** Text-only variant for dense tables. */
export function StatusText({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
      <Dot tone={tone} />
      <span className={cn(tone === "danger" || tone === "warning" ? TEXT[tone] : "text-foreground")}>{label}</span>
    </span>
  );
}

type Mapping = Record<string, { tone: Tone; label: string }>;

export const CONTROL_STATUS: Mapping = {
  NOT_STARTED: { tone: "muted", label: "Not started" },
  IN_PROGRESS: { tone: "info", label: "In progress" },
  IMPLEMENTED: { tone: "success", label: "Implemented" },
  NOT_APPLICABLE: { tone: "neutral", label: "Not applicable" },
};

export const HEALTH: Mapping = {
  READY: { tone: "success", label: "Ready" },
  ATTENTION: { tone: "warning", label: "Attention" },
  NOT_READY: { tone: "danger", label: "Not ready" },
  NA: { tone: "muted", label: "Not applicable" },
};

export const PRIORITY: Mapping = {
  LOW: { tone: "muted", label: "Low" },
  MEDIUM: { tone: "info", label: "Medium" },
  HIGH: { tone: "warning", label: "High" },
  CRITICAL: { tone: "danger", label: "Critical" },
};

export const SEVERITY = PRIORITY;

export const EVIDENCE_STATUS: Mapping = {
  PENDING_REVIEW: { tone: "info", label: "Pending review" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "Rejected" },
};

export const FRESHNESS: Mapping = {
  CURRENT: { tone: "success", label: "Current" },
  EXPIRING_SOON: { tone: "warning", label: "Expiring soon" },
  EXPIRED: { tone: "danger", label: "Expired" },
  NO_EXPIRY: { tone: "muted", label: "No expiry" },
};

export const REQUIREMENT_STATE: Mapping = {
  SATISFIED: { tone: "success", label: "Satisfied" },
  EXPIRING_SOON: { tone: "warning", label: "Expiring soon" },
  PENDING_REVIEW: { tone: "info", label: "Pending review" },
  REJECTED: { tone: "danger", label: "Rejected" },
  EXPIRED: { tone: "danger", label: "Expired" },
  MISSING: { tone: "danger", label: "Missing" },
};

export const COVERAGE: Mapping = {
  COVERED: { tone: "success", label: "Covered" },
  PARTIAL: { tone: "warning", label: "Partial" },
  UNCOVERED: { tone: "danger", label: "Uncovered" },
};

export const TASK_STATUS: Mapping = {
  TODO: { tone: "muted", label: "To do" },
  IN_PROGRESS: { tone: "info", label: "In progress" },
  BLOCKED: { tone: "warning", label: "Blocked" },
  DONE: { tone: "success", label: "Done" },
  CANCELED: { tone: "neutral", label: "Canceled" },
};

export const RISK_STATUS: Mapping = {
  OPEN: { tone: "danger", label: "Open" },
  IN_PROGRESS: { tone: "info", label: "In progress" },
  MITIGATED: { tone: "success", label: "Mitigated" },
  ACCEPTED: { tone: "neutral", label: "Accepted" },
  CLOSED: { tone: "muted", label: "Closed" },
};

export const ROLE: Mapping = {
  OWNER: { tone: "accent", label: "Owner" },
  ADMIN: { tone: "info", label: "Admin" },
  MEMBER: { tone: "neutral", label: "Member" },
  VIEWER: { tone: "muted", label: "Viewer" },
};

export const INVITATION_STATE: Mapping = {
  PENDING: { tone: "info", label: "Pending" },
  ACCEPTED: { tone: "success", label: "Accepted" },
  REVOKED: { tone: "neutral", label: "Revoked" },
  EXPIRED: { tone: "muted", label: "Expired" },
};

export function Status({ map, value, text }: { map: Mapping; value: string; text?: boolean }) {
  const entry = map[value] ?? { tone: "muted" as Tone, label: value };
  return text ? <StatusText tone={entry.tone} label={entry.label} /> : <StatusBadge tone={entry.tone} label={entry.label} />;
}
