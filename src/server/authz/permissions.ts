import type { EvidenceStatus, Role } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/errors";

/**
 * The single permission module. Every server entry point and service asks this module, and the
 * UI receives flags computed from it. Roles come only from the membership row in the database.
 *
 * Matrix: docs/SECURITY.md and the specification, Section 6.
 */

export type PermissionSubject = {
  user: { id: string };
  role: Role;
  org: { requireIndependentEvidenceReview: boolean };
};

/** Resources (ownership facts) that some actions need. */
export type ActionResources = {
  "org.view": undefined;
  "evidence.download": undefined;
  "auditLog.view": undefined;
  "auditLog.viewRequestContext": undefined;
  "auditLog.export": undefined;
  "auditLog.verify": undefined;
  "org.updateSettings": undefined;
  "framework.manage": undefined;
  "member.invite": { role: Role };
  "invitation.revoke": undefined;
  "member.changeRole": { targetRole: Role; newRole: Role; isLastOwner: boolean };
  "member.remove": { targetRole: Role; targetUserId: string; isLastOwner: boolean };
  "member.leave": { isLastOwner: boolean };
  "control.manage": undefined;
  "control.updateStatus": { ownerId: string | null };
  "control.review": { ownerId: string | null };
  "evidence.contribute": undefined;
  "evidence.editMetadata": { uploadedById: string; status: EvidenceStatus };
  "evidence.review": { versionUploadedById: string | null };
  "task.create": undefined;
  "task.edit": { createdById: string; assigneeId: string | null };
  "task.delete": { createdById: string };
  "risk.create": undefined;
  "risk.edit": { ownerId: string | null };
  "risk.accept": undefined;
  "risk.archive": undefined;
};

export type Action = keyof ActionResources;

export type PermissionResult = { ok: true } | { ok: false; reason: string };

const ALLOW: PermissionResult = { ok: true };
const deny = (reason: string): PermissionResult => ({ ok: false, reason });

const isManager = (role: Role) => role === "OWNER" || role === "ADMIN";
const canWrite = (role: Role) => role !== "VIEWER";

const MANAGERS_ONLY = "Only Owners and Admins can do this.";
const VIEWER_READ_ONLY = "Viewers have read-only access.";

type Args<A extends Action> = ActionResources[A] extends undefined ? [resource?: undefined] : [resource: ActionResources[A]];

export function check<A extends Action>(subject: PermissionSubject, action: A, ...args: Args<A>): PermissionResult {
  const resource = args[0] as ActionResources[Action];
  const { role } = subject;
  const userId = subject.user.id;

  switch (action) {
    case "org.view":
    case "evidence.download":
    case "auditLog.view":
      return ALLOW;

    case "auditLog.viewRequestContext":
    case "auditLog.export":
    case "auditLog.verify":
    case "org.updateSettings":
    case "framework.manage":
    case "invitation.revoke":
    case "control.manage":
    case "risk.accept":
    case "risk.archive":
      return isManager(role) ? ALLOW : deny(MANAGERS_ONLY);

    case "member.invite": {
      const r = resource as ActionResources["member.invite"];
      if (!isManager(role)) return deny("Only Owners and Admins can invite members.");
      if (r.role === "OWNER" && role !== "OWNER") return deny("Only Owners can invite another Owner.");
      return ALLOW;
    }

    case "member.changeRole": {
      const r = resource as ActionResources["member.changeRole"];
      if (role === "OWNER") {
        if (r.targetRole === "OWNER" && r.newRole !== "OWNER" && r.isLastOwner) {
          return deny("The last Owner cannot be demoted. Make someone else an Owner first.");
        }
        return ALLOW;
      }
      if (role === "ADMIN") {
        const limited = (x: Role) => x === "MEMBER" || x === "VIEWER";
        if (!limited(r.targetRole)) return deny("Admins cannot change the role of Owners or Admins.");
        if (!limited(r.newRole)) return deny("Admins can only switch members between Member and Viewer.");
        return ALLOW;
      }
      return deny("Only Owners and Admins can change roles.");
    }

    case "member.remove": {
      const r = resource as ActionResources["member.remove"];
      if (r.targetUserId === userId) return deny("Use “Leave organization” to remove yourself.");
      if (role === "OWNER") {
        if (r.targetRole === "OWNER" && r.isLastOwner) return deny("The last Owner cannot be removed.");
        return ALLOW;
      }
      if (role === "ADMIN") {
        if (r.targetRole === "MEMBER" || r.targetRole === "VIEWER") return ALLOW;
        return deny("Admins can only remove Members and Viewers.");
      }
      return deny("Only Owners and Admins can remove members.");
    }

    case "member.leave": {
      const r = resource as ActionResources["member.leave"];
      if (role === "OWNER" && r.isLastOwner) {
        return deny("You are the last Owner. Make someone else an Owner before leaving.");
      }
      return ALLOW;
    }

    case "control.updateStatus":
    case "control.review": {
      const r = resource as ActionResources["control.review"];
      if (isManager(role)) return ALLOW;
      if (role === "MEMBER") {
        return r.ownerId === userId ? ALLOW : deny("Only the control owner, Owners and Admins can do this.");
      }
      return deny(VIEWER_READ_ONLY);
    }

    case "evidence.contribute":
    case "task.create":
    case "risk.create":
      return canWrite(role) ? ALLOW : deny(VIEWER_READ_ONLY);

    case "evidence.editMetadata": {
      const r = resource as ActionResources["evidence.editMetadata"];
      if (isManager(role)) return ALLOW;
      if (role === "MEMBER") {
        if (r.uploadedById !== userId) return deny("Members can only change evidence they uploaded.");
        if (r.status !== "PENDING_REVIEW") return deny("Evidence can only be changed while it is pending review.");
        return ALLOW;
      }
      return deny(VIEWER_READ_ONLY);
    }

    case "evidence.review": {
      const r = resource as ActionResources["evidence.review"];
      if (!isManager(role)) return deny("Only Owners and Admins can approve or reject evidence.");
      if (subject.org.requireIndependentEvidenceReview && r.versionUploadedById === userId) {
        return deny("You uploaded this version; independent review is required.");
      }
      return ALLOW;
    }

    case "task.edit": {
      const r = resource as ActionResources["task.edit"];
      if (isManager(role)) return ALLOW;
      if (role === "MEMBER") {
        return r.createdById === userId || r.assigneeId === userId
          ? ALLOW
          : deny("Only the task creator, the assignee, Owners and Admins can edit this task.");
      }
      return deny(VIEWER_READ_ONLY);
    }

    case "task.delete": {
      const r = resource as ActionResources["task.delete"];
      if (isManager(role)) return ALLOW;
      if (role === "MEMBER") {
        return r.createdById === userId ? ALLOW : deny("Only the task creator, Owners and Admins can delete this task.");
      }
      return deny(VIEWER_READ_ONLY);
    }

    case "risk.edit": {
      const r = resource as ActionResources["risk.edit"];
      if (isManager(role)) return ALLOW;
      if (role === "MEMBER") {
        return r.ownerId === userId ? ALLOW : deny("Only the risk owner, Owners and Admins can edit this risk.");
      }
      return deny(VIEWER_READ_ONLY);
    }
  }
  // Exhaustiveness: every Action is handled above.
  const unreachable: never = action as never;
  return deny(`Unknown action ${String(unreachable)}`);
}

export function can<A extends Action>(subject: PermissionSubject, action: A, ...args: Args<A>): boolean {
  return check(subject, action, ...args).ok;
}

export function assertCan<A extends Action>(subject: PermissionSubject, action: A, ...args: Args<A>): void {
  const result = check(subject, action, ...args);
  if (!result.ok) throw new ForbiddenError(result.reason);
}

/** Reason string for a denied permission, or null when allowed (for UI tooltips). */
export function denialReason<A extends Action>(subject: PermissionSubject, action: A, ...args: Args<A>): string | null {
  const result = check(subject, action, ...args);
  return result.ok ? null : result.reason;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLES: readonly Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

/** Roles the subject may assign in an invitation. */
export function invitableRoles(subject: PermissionSubject): Role[] {
  return ROLES.filter((r) => can(subject, "member.invite", { role: r }));
}
