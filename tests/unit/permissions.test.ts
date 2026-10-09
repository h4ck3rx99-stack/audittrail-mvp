import { describe, expect, it } from "vitest";
import type { EvidenceStatus, Role } from "@/generated/prisma/enums";
import { can, check, invitableRoles, type PermissionSubject } from "@/server/authz/permissions";

const ME = "user-me";
const OTHER = "user-other";

function subject(role: Role, requireIndependentEvidenceReview = true): PermissionSubject {
  return { user: { id: ME }, role, org: { requireIndependentEvidenceReview } };
}

const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

type Row = { name: string; expect: Record<Role, boolean>; run: (s: PermissionSubject) => boolean };

/** Section 6 permission matrix, row by row × every role. */
const MATRIX: Row[] = [
  {
    name: "view dashboard/controls/evidence/tasks/risks",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: true },
    run: (s) => can(s, "org.view"),
  },
  {
    name: "download evidence",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: true },
    run: (s) => can(s, "evidence.download"),
  },
  {
    name: "view audit log",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: true },
    run: (s) => can(s, "auditLog.view"),
  },
  {
    name: "see IP and user agent in audit log",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "auditLog.viewRequestContext"),
  },
  {
    name: "export audit log",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "auditLog.export"),
  },
  {
    name: "verify audit chain",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "auditLog.verify"),
  },
  {
    name: "update organization settings",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "org.updateSettings"),
  },
  {
    name: "adopt framework / change scope",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "framework.manage"),
  },
  {
    name: "invite a Member",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "member.invite", { role: "MEMBER" }),
  },
  {
    name: "invite an Owner",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "member.invite", { role: "OWNER" }),
  },
  {
    name: "revoke invitations",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "invitation.revoke"),
  },
  {
    name: "change Member → Viewer",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "MEMBER", newRole: "VIEWER", isLastOwner: false }),
  },
  {
    name: "change Viewer → Admin (escalation)",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "VIEWER", newRole: "ADMIN", isLastOwner: false }),
  },
  {
    name: "change Member → Owner (escalation)",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "MEMBER", newRole: "OWNER", isLastOwner: false }),
  },
  {
    name: "change an Admin's role",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "ADMIN", newRole: "MEMBER", isLastOwner: false }),
  },
  {
    name: "demote a non-last Owner",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "OWNER", newRole: "ADMIN", isLastOwner: false }),
  },
  {
    name: "demote the last Owner",
    expect: { OWNER: false, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.changeRole", { targetRole: "OWNER", newRole: "ADMIN", isLastOwner: true }),
  },
  {
    name: "remove a Member",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.remove", { targetRole: "MEMBER", targetUserId: OTHER, isLastOwner: false }),
  },
  {
    name: "remove a Viewer",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.remove", { targetRole: "VIEWER", targetUserId: OTHER, isLastOwner: false }),
  },
  {
    name: "remove an Admin",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.remove", { targetRole: "ADMIN", targetUserId: OTHER, isLastOwner: false }),
  },
  {
    name: "remove a non-last Owner",
    expect: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.remove", { targetRole: "OWNER", targetUserId: OTHER, isLastOwner: false }),
  },
  {
    name: "remove the last Owner",
    expect: { OWNER: false, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) =>
      can(s, "member.remove", { targetRole: "OWNER", targetUserId: OTHER, isLastOwner: true }),
  },
  {
    name: "leave organization (not last Owner)",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: true },
    run: (s) => can(s, "member.leave", { isLastOwner: false }),
  },
  {
    name: "leave organization as last Owner",
    expect: { OWNER: false, ADMIN: true, MEMBER: true, VIEWER: true },
    run: (s) => can(s, "member.leave", { isLastOwner: s.role === "OWNER" }),
  },
  {
    name: "create/archive/edit control definition, assign owners",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "control.manage"),
  },
  {
    name: "update status of own control",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "control.updateStatus", { ownerId: ME }),
  },
  {
    name: "update status of someone else's control",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "control.updateStatus", { ownerId: OTHER }),
  },
  {
    name: "update status of an unowned control",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "control.updateStatus", { ownerId: null }),
  },
  {
    name: "record review of own control",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "control.review", { ownerId: ME }),
  },
  {
    name: "record review of someone else's control",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "control.review", { ownerId: OTHER }),
  },
  {
    name: "upload / version / link evidence",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "evidence.contribute"),
  },
  ...(["PENDING_REVIEW", "APPROVED", "REJECTED"] as EvidenceStatus[]).flatMap((status): Row[] => [
    {
      name: `edit own upload (${status})`,
      expect: { OWNER: true, ADMIN: true, MEMBER: status === "PENDING_REVIEW", VIEWER: false },
      run: (s) => can(s, "evidence.editMetadata", { uploadedById: ME, status }),
    },
    {
      name: `edit someone else's upload (${status})`,
      expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
      run: (s) => can(s, "evidence.editMetadata", { uploadedById: OTHER, status }),
    },
  ]),
  {
    name: "approve/reject someone else's evidence",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "evidence.review", { versionUploadedById: OTHER }),
  },
  {
    name: "approve/reject own upload (independent review on)",
    expect: { OWNER: false, ADMIN: false, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "evidence.review", { versionUploadedById: ME }),
  },
  {
    name: "approve/reject own upload (independent review off)",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) =>
      can({ ...s, org: { requireIndependentEvidenceReview: false } }, "evidence.review", {
        versionUploadedById: ME,
      }),
  },
  {
    name: "create tasks",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "task.create"),
  },
  {
    name: "edit task as creator",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "task.edit", { createdById: ME, assigneeId: OTHER }),
  },
  {
    name: "edit task as assignee",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "task.edit", { createdById: OTHER, assigneeId: ME }),
  },
  {
    name: "edit unrelated task",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "task.edit", { createdById: OTHER, assigneeId: OTHER }),
  },
  {
    name: "delete task as creator",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "task.delete", { createdById: ME }),
  },
  {
    name: "delete task as non-creator",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "task.delete", { createdById: OTHER }),
  },
  {
    name: "create risks",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "risk.create"),
  },
  {
    name: "edit risk as risk owner",
    expect: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
    run: (s) => can(s, "risk.edit", { ownerId: ME }),
  },
  {
    name: "edit someone else's risk",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "risk.edit", { ownerId: OTHER }),
  },
  {
    name: "set a risk to Accepted",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "risk.accept"),
  },
  {
    name: "archive risks",
    expect: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
    run: (s) => can(s, "risk.archive"),
  },
];

describe("permission matrix", () => {
  for (const row of MATRIX) {
    for (const role of ROLES) {
      it(`${role} ${row.expect[role] ? "can" : "cannot"} ${row.name}`, () => {
        expect(row.run(subject(role))).toBe(row.expect[role]);
      });
    }
  }
});

describe("permission explanations", () => {
  it("explains the independent review rule", () => {
    const result = check(subject("ADMIN"), "evidence.review", { versionUploadedById: ME });
    expect(result).toEqual({
      ok: false,
      reason: "You uploaded this version; independent review is required.",
    });
  });

  it("explains why Members cannot approve evidence", () => {
    const result = check(subject("MEMBER"), "evidence.review", { versionUploadedById: OTHER });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Owners and Admins/);
  });

  it("does not let anyone remove themselves through member.remove", () => {
    expect(
      can(subject("OWNER"), "member.remove", {
        targetRole: "MEMBER",
        targetUserId: ME,
        isLastOwner: false,
      }),
    ).toBe(false);
  });

  it("limits the roles an Admin can invite", () => {
    expect(invitableRoles(subject("ADMIN"))).toEqual(["ADMIN", "MEMBER", "VIEWER"]);
    expect(invitableRoles(subject("OWNER"))).toEqual(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
    expect(invitableRoles(subject("MEMBER"))).toEqual([]);
  });
});
