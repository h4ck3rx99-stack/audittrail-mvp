import type { AuditAction } from "./catalog";
import { isAuditAction } from "./catalog";

/**
 * Human-readable rendering of audit events. Used by every activity feed and the audit log.
 * Pure and client-safe (no server imports) so it can also run in tests.
 */

export type DescribableEvent = {
  action: string;
  actorName: string | null;
  actorType: "USER" | "SYSTEM";
  resourceLabel: string | null;
  changes: unknown;
  metadata: unknown;
};

const ENUM_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IMPLEMENTED: "Implemented",
  NOT_APPLICABLE: "Not applicable",
  TODO: "To do",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELED: "Canceled",
  OPEN: "Open",
  MITIGATED: "Mitigated",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  EFFECTIVE: "Effective",
  NEEDS_IMPROVEMENT: "Needs improvement",
  INEFFECTIVE: "Ineffective",
};

export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") return ENUM_LABELS[value] ?? value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(humanizeValue).join(", ") || "none";
  return JSON.stringify(value);
}

export function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

type ChangeMap = Record<string, { from: unknown; to: unknown }>;

function asChanges(value: unknown): ChangeMap {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as ChangeMap;
  return {};
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function change(changes: ChangeMap, field: string): string | null {
  const c = changes[field];
  if (!c) return null;
  return `from ${humanizeValue(c.from)} to ${humanizeValue(c.to)}`;
}

function fieldList(changes: ChangeMap): string {
  const fields = Object.keys(changes).map(humanizeField);
  if (fields.length === 0) return "";
  return ` (${fields.join(", ").toLowerCase()})`;
}

const DESCRIBERS: Record<AuditAction, (label: string, c: ChangeMap, m: Record<string, unknown>) => string> = {
  "user.signed_up": () => "created an account",
  "user.logged_in": () => "signed in",
  "user.logged_out": () => "signed out",
  "user.login_failed": () => "failed to sign in (wrong password)",
  "user.password_changed": () => "changed their password",
  "user.password_reset_requested": () => "requested a password reset",
  "user.password_reset_completed": () => "reset their password",
  "user.profile_updated": (_l, c) => `updated their profile${fieldList(c)}`,
  "session.revoked": (_l, _c, m) =>
    typeof m.count === "number" ? `revoked ${m.count} session${m.count === 1 ? "" : "s"}` : "revoked a session",
  "member.logged_in": () => "signed in",
  "organization.created": (l) => `created the organization ${l}`,
  "organization.updated": (_l, c) => `updated the organization profile${fieldList(c)}`,
  "organization.settings_updated": (_l, c) => {
    const review = change(c, "requireIndependentEvidenceReview");
    if (review) return `changed independent evidence review ${review}`;
    return `updated organization settings${fieldList(c)}`;
  },
  "framework.adopted": (l, _c, m) =>
    `adopted ${l}${typeof m.controlsCreated === "number" ? ` with ${m.controlsCreated} controls` : ""}`,
  "framework.scope_updated": (l) => `changed the scope of ${l}`,
  "invitation.created": (l, _c, m) => `invited ${l} as ${humanizeValue(m.role)}`,
  "invitation.revoked": (l) => `revoked the invitation for ${l}`,
  "invitation.accepted": (l) => `accepted the invitation and joined as ${l}`,
  "member.role_changed": (l, c) => `changed ${l}'s role ${change(c, "role") ?? ""}`.trim(),
  "member.removed": (l) => `removed ${l} from the organization`,
  "member.left": () => "left the organization",
  "control.created": (l) => `created control ${l}`,
  "control.updated": (l, c) => `updated control ${l}${fieldList(c)}`,
  "control.status_changed": (l, c) => `changed the status of ${l} ${change(c, "status") ?? ""}`.trim(),
  "control.owner_changed": (l, _c, m) =>
    m.toName ? `assigned ${l} to ${String(m.toName)}` : `removed the owner of ${l}`,
  "control.reviewed": (l, _c, m) => `reviewed ${l}: ${humanizeValue(m.outcome)}`,
  "control.archived": (l) => `archived control ${l}`,
  "control.restored": (l) => `restored control ${l}`,
  "control.requirement_mapped": (l, _c, m) => `mapped ${l} to ${String(m.requirementCode ?? "a requirement")}`,
  "control.requirement_unmapped": (l, _c, m) =>
    `unmapped ${l} from ${String(m.requirementCode ?? "a requirement")}`,
  "evidence_requirement.created": (l, _c, m) =>
    `added evidence requirement "${l}"${m.controlCode ? ` to ${String(m.controlCode)}` : ""}`,
  "evidence_requirement.updated": (l, c) => `updated evidence requirement "${l}"${fieldList(c)}`,
  "evidence_requirement.archived": (l) => `archived evidence requirement "${l}"`,
  "evidence.uploaded": (l) => `uploaded evidence "${l}"`,
  "evidence.version_added": (l, _c, m) =>
    typeof m.versionNumber === "number" ? `added version ${m.versionNumber} of "${l}"` : `added a new version of "${l}"`,
  "evidence.updated": (l, c) => `updated evidence "${l}"${fieldList(c)}`,
  "evidence.linked": (l, _c, m) =>
    `linked "${l}" to ${String(m.controlCode ?? "a control")}${m.requirementTitle ? ` (${String(m.requirementTitle)})` : ""}`,
  "evidence.unlinked": (l, _c, m) => `unlinked "${l}" from ${String(m.controlCode ?? "a control")}`,
  "evidence.approved": (l) => `approved evidence "${l}"`,
  "evidence.rejected": (l) => `rejected evidence "${l}"`,
  "evidence.deleted": (l) => `deleted evidence "${l}"`,
  "evidence.downloaded": (l, _c, m) =>
    `downloaded "${l}"${m.versionNumber ? ` (version ${String(m.versionNumber)})` : ""}`,
  "task.created": (l) => `created task ${l}`,
  "task.updated": (l, c) => `updated task ${l}${fieldList(c)}`,
  "task.assigned": (l, _c, m) => (m.toName ? `assigned ${l} to ${String(m.toName)}` : `unassigned ${l}`),
  "task.status_changed": (l, c) => `changed the status of ${l} ${change(c, "status") ?? ""}`.trim(),
  "task.completed": (l) => `completed ${l}`,
  "task.reopened": (l) => `reopened ${l}`,
  "task.deleted": (l) => `deleted task ${l}`,
  "risk.created": (l) => `created risk ${l}`,
  "risk.updated": (l, c) => `updated risk ${l}${fieldList(c)}`,
  "risk.status_changed": (l, c) => `changed the status of ${l} ${change(c, "status") ?? ""}`.trim(),
  "risk.accepted": (l) => `accepted risk ${l}`,
  "risk.resolved": (l, c) => `resolved ${l} ${change(c, "status") ?? ""}`.trim(),
  "risk.archived": (l) => `archived risk ${l}`,
  "audit_log.exported": (_l, _c, m) =>
    `exported the audit log${typeof m.rowCount === "number" ? ` (${m.rowCount} events)` : ""}`,
  "audit_log.verified": (_l, _c, m) =>
    m.valid === true
      ? `verified audit log integrity (${String(m.eventCount ?? 0)} events, chain intact)`
      : "ran an audit log integrity check that found a problem",
};

/** e.g. "changed the status of AC-01 from In progress to Implemented" */
export function describeAction(event: DescribableEvent): string {
  const label = event.resourceLabel ?? "a resource";
  if (!isAuditAction(event.action)) return `${event.action} ${label}`;
  return DESCRIBERS[event.action](label, asChanges(event.changes), asMeta(event.metadata));
}

/** e.g. "Dana Lee changed the status of AC-01 from In progress to Implemented" */
export function describeEvent(event: DescribableEvent): string {
  const actor = event.actorName ?? (event.actorType === "SYSTEM" ? "System" : "Someone");
  return `${actor} ${describeAction(event)}`;
}

export function actionLabel(action: string): string {
  const [resource, verb] = action.split(".");
  if (!resource || !verb) return action;
  return `${humanizeField(resource)} ${verb.replace(/_/g, " ")}`;
}
