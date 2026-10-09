import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { verifyAuditChain } from "@/server/audit/verify";
import { orgChainKey } from "@/server/audit/hash";
import {
  archiveControl,
  assignControlOwner,
  bulkAssignOwner,
  bulkChangeStatus,
  createControl,
  createEvidenceRequirement,
  mapRequirement,
  recordControlReview,
  restoreControl,
  unmapRequirement,
  updateControlDefinition,
  updateControlStatus,
} from "@/features/controls/server/service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { addMonths, todayInTimeZone } from "@/lib/dates";
import { resetDatabase } from "../helpers/db";
import {
  auditEventsFor,
  createOrgWithRoles,
  createUser,
  type OrgFixture,
} from "../helpers/factories";
import { adoptSoc2, controlByCode } from "../helpers/fixtures";

let f: OrgFixture;

describe("framework adoption", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
  });

  it("instantiates controls, mappings and evidence requirements in one audited transaction", async () => {
    const result = await adoptSoc2(f.ctx.admin);
    expect(result.controlsCreated).toBe(55);
    expect(result.evidenceRequirementsCreated).toBe(76);
    expect(await db.control.count({ where: { organizationId: f.org.id } })).toBe(55);
    expect(
      await db.control.count({ where: { organizationId: f.org.id, ownerId: { not: null } } }),
    ).toBe(0);
    const ac01 = await controlByCode(f.org.id, "AC-01");
    expect(ac01.evidenceRequirements.map((r) => r.title)).toEqual([
      "Identity provider MFA enforcement setting",
      "User list showing MFA status",
    ]);

    const events = await auditEventsFor(f.org.id);
    const created = events.filter((e) => e.action === "control.created");
    const adopted = events.filter((e) => e.action === "framework.adopted");
    expect(created).toHaveLength(55);
    expect(adopted).toHaveLength(1);
    const correlation = (adopted[0]!.metadata as { correlationId: string }).correlationId;
    expect(
      created.every((e) => (e.metadata as { correlationId: string }).correlationId === correlation),
    ).toBe(true);
    expect(adopted[0]!.metadata).toMatchObject({
      controlsCreated: 55,
      evidenceRequirementsCreated: 76,
      scope: ["SECURITY", "AVAILABILITY", "CONFIDENTIALITY"],
    });
    expect((await verifyAuditChain(orgChainKey(f.org.id))).valid).toBe(true);
  });

  it("is idempotent", async () => {
    await adoptSoc2(f.ctx.admin);
    const before = await db.auditEvent.count();
    const again = await adoptSoc2(f.ctx.owner);
    expect(again).toMatchObject({ newlyAdopted: false, controlsCreated: 0 });
    expect(await db.control.count({ where: { organizationId: f.org.id } })).toBe(55);
    expect(await db.auditEvent.count()).toBe(before);
  });

  it("always includes the required Security category", async () => {
    await adoptSoc2(f.ctx.admin, ["AVAILABILITY"]);
    const scopes = await db.organizationFrameworkScope.findMany({ include: { requirement: true } });
    expect(scopes.map((s) => s.requirement.code).sort()).toEqual(["AVAILABILITY", "SECURITY"]);
  });

  it("is restricted to Owners and Admins", async () => {
    await expect(adoptSoc2(f.ctx.member)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adoptSoc2(f.ctx.viewer)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("controls", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
    await adoptSoc2(f.ctx.admin);
  });

  it("creates a custom control mapped to adopted requirements", async () => {
    const req = await db.frameworkRequirement.findFirstOrThrow({ where: { code: "CC6.1" } });
    const control = await createControl(f.ctx.admin, {
      code: "cus-01",
      name: "Custom access control",
      description: "Something specific",
      priority: "HIGH",
      reviewFrequency: "QUARTERLY",
      ownerId: f.users.member.id,
      requirementIds: [req.id],
    });
    expect(control.code).toBe("CUS-01");
    expect(control.ownerId).toBe(f.users.member.id);
    const events = await auditEventsFor(f.org.id);
    expect(events.at(-1)).toMatchObject({
      action: "control.created",
      resourceId: control.id,
      actorUserId: f.users.admin.id,
      actorRole: "ADMIN",
    });
    // Owner is notified.
    expect(
      await db.notification.count({
        where: { recipientId: f.users.member.id, type: "CONTROL_ASSIGNED" },
      }),
    ).toBe(1);
    await expect(
      createControl(f.ctx.admin, {
        code: "CUS-01",
        name: "Dup",
        description: "x",
        priority: "LOW",
        reviewFrequency: "ANNUALLY",
        ownerId: null,
        requirementIds: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a justification for NOT_APPLICABLE", async () => {
    const c = await controlByCode(f.org.id, "AC-06");
    await expect(
      updateControlStatus(f.ctx.admin, c.id, { version: c.version, status: "NOT_APPLICABLE" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await updateControlStatus(f.ctx.admin, c.id, {
      version: c.version,
      status: "NOT_APPLICABLE",
      notApplicableReason: "Fully remote company",
    });
    const after = await controlByCode(f.org.id, "AC-06");
    expect(after.status).toBe("NOT_APPLICABLE");
    expect(after.notApplicableReason).toBe("Fully remote company");
    const event = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(event.action).toBe("control.status_changed");
    expect(event.changes).toEqual({
      status: { from: "NOT_STARTED", to: "NOT_APPLICABLE" },
      notApplicableReason: { from: null, to: "Fully remote company" },
    });
  });

  it("enforces optimistic concurrency", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    await updateControlDefinition(f.ctx.admin, c.id, {
      version: c.version,
      code: c.code,
      name: "MFA everywhere",
      description: c.description,
      domain: c.domain,
      priority: c.priority,
      reviewFrequency: c.reviewFrequency,
    });
    const eventsBefore = await db.auditEvent.count();
    await expect(
      updateControlDefinition(f.ctx.owner, c.id, {
        version: c.version,
        code: c.code,
        name: "Stale edit",
        description: c.description,
        domain: c.domain,
        priority: c.priority,
        reviewFrequency: c.reviewFrequency,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await controlByCode(f.org.id, "AC-01")).name).toBe("MFA everywhere");
    expect(await db.auditEvent.count()).toBe(eventsBefore);
  });

  it("only assigns owners who are current members", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    const outsider = await createUser();
    await expect(
      assignControlOwner(f.ctx.admin, c.id, { ownerId: outsider.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await assignControlOwner(f.ctx.admin, c.id, { ownerId: f.users.member.id });
    const event = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(event).toMatchObject({
      action: "control.owner_changed",
      changes: { ownerId: { from: null, to: f.users.member.id } },
    });
  });

  it("lets Members change status only on controls they own", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    await expect(
      updateControlStatus(f.ctx.member, c.id, { version: c.version, status: "IN_PROGRESS" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await assignControlOwner(f.ctx.admin, c.id, { ownerId: f.users.member.id });
    const owned = await controlByCode(f.org.id, "AC-01");
    await updateControlStatus(f.ctx.member, c.id, {
      version: owned.version,
      status: "IN_PROGRESS",
    });
    await expect(
      updateControlStatus(f.ctx.viewer, c.id, {
        version: owned.version + 1,
        status: "IMPLEMENTED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("records a review and computes the next review date from the frequency", async () => {
    const c = await controlByCode(f.org.id, "AC-03"); // quarterly
    const review = await recordControlReview(f.ctx.admin, c.id, {
      outcome: "EFFECTIVE",
      notes: "Checked Q3 review",
    });
    const today = todayInTimeZone("UTC");
    expect(review.nextReviewDate.toISOString().slice(0, 10)).toBe(addMonths(today, 3));
    const after = await controlByCode(f.org.id, "AC-03");
    expect(after.lastReviewedAt).not.toBeNull();
    expect(after.nextReviewDate?.toISOString().slice(0, 10)).toBe(addMonths(today, 3));
    const override = await recordControlReview(f.ctx.admin, c.id, {
      outcome: "NEEDS_IMPROVEMENT",
      notes: "Follow-up",
      nextReviewDate: "2099-01-31",
    });
    expect(override.nextReviewDate.toISOString().slice(0, 10)).toBe("2099-01-31");
  });

  it("archives and restores, and blocks edits while archived", async () => {
    const c = await controlByCode(f.org.id, "HR-04");
    await archiveControl(f.ctx.admin, c.id);
    await expect(
      updateControlStatus(f.ctx.admin, c.id, { version: c.version + 1, status: "IN_PROGRESS" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await restoreControl(f.ctx.owner, c.id);
    const actions = (await auditEventsFor(f.org.id)).slice(-2).map((e) => e.action);
    expect(actions).toEqual(["control.archived", "control.restored"]);
    await expect(archiveControl(f.ctx.member, c.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps and unmaps requirements", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    const req = await db.frameworkRequirement.findFirstOrThrow({ where: { code: "CC6.6" } });
    await mapRequirement(f.ctx.admin, c.id, req.id);
    await expect(mapRequirement(f.ctx.admin, c.id, req.id)).rejects.toBeInstanceOf(ConflictError);
    await unmapRequirement(f.ctx.admin, c.id, req.id);
    const actions = (await auditEventsFor(f.org.id))
      .slice(-2)
      .map((e) => [e.action, (e.metadata as { requirementCode: string }).requirementCode]);
    expect(actions).toEqual([
      ["control.requirement_mapped", "CC6.6"],
      ["control.requirement_unmapped", "CC6.6"],
    ]);
  });

  it("bulk operations write one event per control with a shared correlation ID", async () => {
    const a = await controlByCode(f.org.id, "AC-01");
    const b = await controlByCode(f.org.id, "AC-02");
    await bulkAssignOwner(f.ctx.admin, { controlIds: [a.id, b.id], ownerId: f.users.member.id });
    await bulkChangeStatus(f.ctx.admin, { controlIds: [a.id, b.id], status: "IN_PROGRESS" });
    const events = (await auditEventsFor(f.org.id)).slice(-4);
    expect(events.map((e) => e.action)).toEqual([
      "control.owner_changed",
      "control.owner_changed",
      "control.status_changed",
      "control.status_changed",
    ]);
    const corr = (i: number) => (events[i]!.metadata as { correlationId: string }).correlationId;
    expect(corr(0)).toBe(corr(1));
    expect(corr(2)).toBe(corr(3));
    expect(corr(0)).not.toBe(corr(2));
    await expect(
      bulkChangeStatus(f.ctx.member, { controlIds: [a.id], status: "IMPLEMENTED" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("manages evidence requirements (Owner/Admin only)", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    await expect(
      createEvidenceRequirement(f.ctx.member, c.id, {
        title: "Extra",
        freshnessDays: 30,
        isRequired: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const req = await createEvidenceRequirement(f.ctx.admin, c.id, {
      title: "Extra proof",
      freshnessDays: 30,
      isRequired: true,
      description: null,
    });
    expect(req.controlId).toBe(c.id);
    expect((await auditEventsFor(f.org.id)).at(-1)?.action).toBe("evidence_requirement.created");
  });
});
