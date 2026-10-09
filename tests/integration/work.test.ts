import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import {
  assignTask,
  changeTaskStatus,
  createTask,
  deleteTask,
  updateTask,
} from "@/features/tasks/server/service";
import {
  archiveRisk,
  changeRiskStatus,
  createRisk,
  updateRisk,
} from "@/features/risks/server/service";
import {
  leaveOrganization,
  changeMemberRole,
  removeMember,
} from "@/features/members/server/service";
import { assignControlOwner } from "@/features/controls/server/service";
import { resetDatabase } from "../helpers/db";
import { auditEventsFor, createOrgWithRoles, type OrgFixture } from "../helpers/factories";
import { adoptSoc2, controlByCode } from "../helpers/fixtures";

let f: OrgFixture;

describe("tasks", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
  });

  it("numbers tasks per organization and audits the lifecycle", async () => {
    const t1 = await createTask(f.ctx.member, { title: "First task", priority: "LOW" });
    const t2 = await createTask(f.ctx.member, {
      title: "Second task",
      priority: "HIGH",
      assigneeId: f.users.member2.id,
      dueDate: "2026-12-01",
    });
    expect([t1.number, t2.number]).toEqual([1, 2]);
    expect(
      await db.notification.count({
        where: { recipientId: f.users.member2.id, type: "TASK_ASSIGNED" },
      }),
    ).toBe(1);

    await updateTask(f.ctx.member, t1.id, { title: "First task renamed", priority: "MEDIUM" });
    await assignTask(f.ctx.member, t1.id, { assigneeId: f.users.member.id });
    await changeTaskStatus(f.ctx.member, t1.id, { status: "IN_PROGRESS" });
    await changeTaskStatus(f.ctx.member, t1.id, { status: "DONE" });
    let task = await db.task.findUniqueOrThrow({ where: { id: t1.id } });
    expect(task.completedAt).not.toBeNull();
    expect(task.completedById).toBe(f.users.member.id);
    await changeTaskStatus(f.ctx.member, t1.id, { status: "TODO" });
    task = await db.task.findUniqueOrThrow({ where: { id: t1.id } });
    expect(task.completedAt).toBeNull();

    const actions = (await auditEventsFor(f.org.id)).map((e) => e.action);
    expect(actions).toEqual([
      "task.created",
      "task.created",
      "task.updated",
      "task.assigned",
      "task.status_changed",
      "task.completed",
      "task.reopened",
    ]);
    // No self-notification when assigning yourself.
    expect(await db.notification.count({ where: { recipientId: f.users.member.id } })).toBe(0);
  });

  it("enforces creator/assignee rules and keeps a snapshot on delete", async () => {
    const t = await createTask(f.ctx.member, {
      title: "Member task",
      priority: "LOW",
      assigneeId: f.users.member2.id,
    });
    await expect(
      updateTask(f.ctx.viewer, t.id, { title: "x x x", priority: "LOW" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createTask(f.ctx.viewer, { title: "nope nope", priority: "LOW" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await changeTaskStatus(f.ctx.member2, t.id, { status: "IN_PROGRESS" }); // assignee may edit
    await expect(deleteTask(f.ctx.member2, t.id)).rejects.toBeInstanceOf(ForbiddenError); // only creator deletes
    await deleteTask(f.ctx.member, t.id);
    expect(await db.task.count()).toBe(0);
    const ev = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(ev.action).toBe("task.deleted");
    expect((ev.metadata as { snapshot: { title: string; status: string } }).snapshot).toMatchObject(
      { title: "Member task", status: "IN_PROGRESS" },
    );
  });

  it("validates gap keys", async () => {
    await expect(
      createTask(f.ctx.admin, { title: "From gap", priority: "LOW", gapKey: "bogus" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const t = await createTask(f.ctx.admin, {
      title: "From gap",
      priority: "LOW",
      gapKey: "control_unowned:00000000-0000-7000-8000-000000000001",
    });
    expect(t.source).toBe("GAP");
  });
});

describe("risks", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
  });

  it("requires resolution notes; Accepted is Owner/Admin only; owners can edit", async () => {
    const r = await createRisk(f.ctx.member, {
      title: "Shared admin account",
      kind: "RISK",
      severity: "HIGH",
      ownerId: f.users.member.id,
    });
    expect(r.number).toBe(1);
    await updateRisk(f.ctx.member, r.id, {
      title: "Shared admin account (billing)",
      kind: "RISK",
      severity: "CRITICAL",
      ownerId: f.users.member.id,
    });
    await expect(
      updateRisk(f.ctx.member2, r.id, { title: "nope nope", kind: "RISK", severity: "LOW" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      changeRiskStatus(f.ctx.member, r.id, { status: "MITIGATED" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      changeRiskStatus(f.ctx.member, r.id, { status: "ACCEPTED", resolutionNotes: "fine" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await changeRiskStatus(f.ctx.admin, r.id, {
      status: "ACCEPTED",
      resolutionNotes: "Compensating controls in place.",
    });
    const accepted = await db.risk.findUniqueOrThrow({ where: { id: r.id } });
    expect(accepted).toMatchObject({ status: "ACCEPTED", resolvedById: f.users.admin.id });
    await changeRiskStatus(f.ctx.member, r.id, { status: "OPEN" });
    expect((await db.risk.findUniqueOrThrow({ where: { id: r.id } })).resolvedAt).toBeNull();
    await changeRiskStatus(f.ctx.member, r.id, {
      status: "MITIGATED",
      resolutionNotes: "Moved to SSO.",
    });
    await expect(archiveRisk(f.ctx.member, r.id)).rejects.toBeInstanceOf(ForbiddenError);
    await archiveRisk(f.ctx.admin, r.id);
    await expect(
      updateRisk(f.ctx.admin, r.id, { title: "after archive", kind: "RISK", severity: "LOW" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const actions = (await auditEventsFor(f.org.id)).map((e) => e.action);
    expect(actions).toEqual([
      "risk.created",
      "risk.updated",
      "risk.accepted",
      "risk.status_changed",
      "risk.resolved",
      "risk.archived",
    ]);
  });

  it("a detected gap can be tracked by only one active risk", async () => {
    const gapKey = "evidence_missing:00000000-0000-7000-8000-000000000002";
    await createRisk(f.ctx.admin, {
      title: "Missing evidence",
      kind: "GAP",
      severity: "MEDIUM",
      gapKey,
    });
    await expect(
      createRisk(f.ctx.admin, {
        title: "Missing evidence again",
        kind: "GAP",
        severity: "MEDIUM",
        gapKey,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("members", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
  });

  it("protects the last Owner and stops Admin escalation", async () => {
    const ownerMembership = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: f.org.id, role: "OWNER" },
    });
    await expect(
      changeMemberRole(f.ctx.owner, ownerMembership.id, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leaveOrganization(f.ctx.owner)).rejects.toBeInstanceOf(ForbiddenError);
    const adminMembership = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: f.org.id, role: "ADMIN" },
    });
    await expect(
      changeMemberRole(f.ctx.admin, adminMembership.id, { role: "OWNER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const viewerMembership = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: f.org.id, role: "VIEWER" },
    });
    await expect(
      changeMemberRole(f.ctx.admin, viewerMembership.id, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await changeMemberRole(f.ctx.admin, viewerMembership.id, { role: "MEMBER" });
    expect(
      await db.notification.count({
        where: { recipientId: f.users.viewer.id, type: "MEMBER_ROLE_CHANGED" },
      }),
    ).toBe(1);
    // With a second owner, the first may step down.
    await changeMemberRole(f.ctx.owner, adminMembership.id, { role: "OWNER" });
    await changeMemberRole(f.ctx.owner, ownerMembership.id, { role: "ADMIN" });
  });

  it("removing a member releases their assignments with audit events", async () => {
    await adoptSoc2(f.ctx.admin);
    const c = await controlByCode(f.org.id, "AC-01");
    await assignControlOwner(f.ctx.admin, c.id, { ownerId: f.users.member.id });
    await createTask(f.ctx.admin, {
      title: "Owned task",
      priority: "LOW",
      assigneeId: f.users.member.id,
    });
    const m = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: f.org.id, userId: f.users.member.id },
    });
    await expect(removeMember(f.ctx.member2, m.id)).rejects.toBeInstanceOf(ForbiddenError);
    await removeMember(f.ctx.admin, m.id);
    expect((await controlByCode(f.org.id, "AC-01")).ownerId).toBeNull();
    const tail = (await auditEventsFor(f.org.id)).slice(-3).map((e) => e.action);
    expect(tail).toEqual(["control.owner_changed", "task.assigned", "member.removed"]);
  });
});
