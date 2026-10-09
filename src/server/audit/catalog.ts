/**
 * The complete, typed catalog of audit actions. Adding an action means adding it here and a
 * description in describe.ts; TypeScript enforces both.
 */

export const AUDIT_ACTIONS = {
  auth: [
    "user.signed_up",
    "user.logged_in",
    "user.logged_out",
    "user.login_failed",
    "user.password_changed",
    "user.password_reset_requested",
    "user.password_reset_completed",
    "user.profile_updated",
    "session.revoked",
  ],
  member_auth: ["member.logged_in"],
  organization: [
    "organization.created",
    "organization.updated",
    "organization.settings_updated",
    "framework.adopted",
    "framework.scope_updated",
  ],
  members: [
    "invitation.created",
    "invitation.revoked",
    "invitation.accepted",
    "member.role_changed",
    "member.removed",
    "member.left",
  ],
  controls: [
    "control.created",
    "control.updated",
    "control.status_changed",
    "control.owner_changed",
    "control.reviewed",
    "control.archived",
    "control.restored",
    "control.requirement_mapped",
    "control.requirement_unmapped",
    "evidence_requirement.created",
    "evidence_requirement.updated",
    "evidence_requirement.archived",
  ],
  evidence: [
    "evidence.uploaded",
    "evidence.version_added",
    "evidence.updated",
    "evidence.linked",
    "evidence.unlinked",
    "evidence.approved",
    "evidence.rejected",
    "evidence.deleted",
    "evidence.downloaded",
  ],
  tasks: [
    "task.created",
    "task.updated",
    "task.assigned",
    "task.status_changed",
    "task.completed",
    "task.reopened",
    "task.deleted",
  ],
  risks: [
    "risk.created",
    "risk.updated",
    "risk.status_changed",
    "risk.accepted",
    "risk.resolved",
    "risk.archived",
  ],
  audit_log: ["audit_log.exported", "audit_log.verified"],
} as const;

export type AuditCategory = keyof typeof AUDIT_ACTIONS;
export type AuditAction = (typeof AUDIT_ACTIONS)[AuditCategory][number];

export const ALL_AUDIT_ACTIONS: readonly AuditAction[] = Object.values(AUDIT_ACTIONS).flat();

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  auth: "Authentication",
  member_auth: "Member sign-ins",
  organization: "Organization",
  members: "Members",
  controls: "Controls",
  evidence: "Evidence",
  tasks: "Tasks",
  risks: "Risks",
  audit_log: "Audit log",
};

export function categoryOf(action: string): AuditCategory | null {
  for (const [category, actions] of Object.entries(AUDIT_ACTIONS) as [
    AuditCategory,
    readonly string[],
  ][]) {
    if (actions.includes(action)) return category;
  }
  return null;
}

export function isAuditAction(value: string): value is AuditAction {
  return (ALL_AUDIT_ACTIONS as readonly string[]).includes(value);
}

export const RESOURCE_TYPES = [
  "user",
  "session",
  "organization",
  "framework",
  "member",
  "invitation",
  "control",
  "evidence_requirement",
  "evidence",
  "task",
  "risk",
  "audit_log",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  user: "User",
  session: "Session",
  organization: "Organization",
  framework: "Framework",
  member: "Member",
  invitation: "Invitation",
  control: "Control",
  evidence_requirement: "Evidence requirement",
  evidence: "Evidence",
  task: "Task",
  risk: "Risk",
  audit_log: "Audit log",
};

export function isResourceType(value: string): value is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(value);
}
