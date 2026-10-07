import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { login } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { loadOrgContext } from "@/server/authz/load-context";
import {
  archiveControl,
  assignControlOwner,
  createControl,
  mapRequirement,
  recordControlReview,
  updateControlStatus,
} from "@/features/controls/server/service";
import { getControlDetail, listControls } from "@/features/controls/server/queries";
import { deleteEvidence, linkEvidence, prepareEvidenceDownload, reviewEvidence, unlinkEvidence, updateEvidence } from "@/features/evidence/server/service";
import { getEvidenceDetail, listEvidence } from "@/features/evidence/server/queries";
import { assignTask, changeTaskStatus, createTask, deleteTask, updateTask } from "@/features/tasks/server/service";
import { getTaskDetail } from "@/features/tasks/server/queries";
import { archiveRisk, changeRiskStatus, createRisk, updateRisk } from "@/features/risks/server/service";
import { getRiskDetail } from "@/features/risks/server/queries";
import { changeMemberRole, listInvitations, listMembers, removeMember, revokeInvitation, createInvitation } from "@/features/members/server/service";
import { listNotifications, markNotificationRead } from "@/features/notifications/server/service";
import { getAuditEvent, listAuditEvents } from "@/features/audit/server/service";
import { searchOrganization } from "@/features/search/server/service";
import { POST as uploadRoute } from "@/app/api/org/[orgSlug]/evidence/upload/route";
import { GET as downloadRoute } from "@/app/api/org/[orgSlug]/evidence/[evidenceId]/versions/[versionId]/download/route";
import { GET as exportRoute } from "@/app/api/org/[orgSlug]/audit-log/export/route";
import { resetDatabase } from "../helpers/db";
import { createOrgWithRoles, TEST_PASSWORD, testRequest, type OrgFixture } from "../helpers/factories";
import { adoptSoc2, controlByCode, samplePdf, uploadPdf } from "../helpers/fixtures";

let A: OrgFixture;
let B: OrgFixture;
const b = {} as {
  controlId: string;
  controlVersion: number;
  requirementId: string;
  evidenceId: string;
  versionId: string;
  linkId: string;
  taskId: string;
  riskId: string;
  memberId: string;
  invitationId: string;
  notificationId: string;
  auditEventId: string;
};

async function expectNotFound(p: Promise<unknown>) {
  await expect(p).rejects.toBeInstanceOf(NotFoundError);
}

describe("tenant isolation", () => {
  beforeAll(async () => {
    await resetDatabase();
    A = await createOrgWithRoles("Alpha");
    B = await createOrgWithRoles("Bravo");
    await adoptSoc2(A.ctx.admin);
    await adoptSoc2(B.ctx.admin);

    const bc = await controlByCode(B.org.id, "AC-01");
    b.controlId = bc.id;
    b.requirementId = bc.evidenceRequirements[0]!.id;
    const ev = await uploadPdf(B.ctx.member, [{ controlId: bc.id, evidenceRequirementId: b.requirementId }], "Bravo policy");
    b.evidenceId = ev.evidenceId;
    b.versionId = ev.versionId;
    b.linkId = (await db.controlEvidence.findFirstOrThrow({ where: { evidenceId: ev.evidenceId } })).id;
    await recordControlReview(B.ctx.admin, bc.id, { outcome: "EFFECTIVE", notes: "ok" });
    b.controlVersion = (await db.control.findUniqueOrThrow({ where: { id: bc.id } })).version;
    b.taskId = (await createTask(B.ctx.admin, { title: "Bravo secret task", priority: "HIGH", assigneeId: B.users.member.id, controlIds: [bc.id] })).id;
    b.riskId = (await createRisk(B.ctx.admin, { title: "Bravo secret risk", kind: "RISK", severity: "HIGH", ownerId: B.users.member.id, controlIds: [bc.id] })).id;
    b.memberId = (await db.organizationMember.findFirstOrThrow({ where: { organizationId: B.org.id, userId: B.users.member.id } })).id;
    await createInvitation(B.ctx.admin, { email: "invitee@bravo.test", role: "MEMBER" });
    b.invitationId = (await db.invitation.findFirstOrThrow({ where: { organizationId: B.org.id } })).id;
    b.notificationId = (await db.notification.findFirstOrThrow({ where: { organizationId: B.org.id } })).id;
    b.auditEventId = (await db.auditEvent.findFirstOrThrow({ where: { organizationId: B.org.id } })).id;
  });

  it("a non-member cannot resolve another organization's context", async () => {
    expect(await loadOrgContext(A.users.owner, B.org.slug, testRequest(), null)).toBeNull();
    expect(await loadOrgContext(A.users.owner, "does-not-exist", testRequest(), null)).toBeNull();
  });

  it("controls: read, update, archive, assign, review and map are all NotFound", async () => {
    const ctx = A.ctx.owner;
    await expectNotFound(getControlDetail(ctx, b.controlId));
    await expectNotFound(updateControlStatus(ctx, b.controlId, { version: b.controlVersion, status: "IMPLEMENTED" }));
    await expectNotFound(archiveControl(ctx, b.controlId));
    await expectNotFound(assignControlOwner(ctx, b.controlId, { ownerId: A.users.member.id }));
    await expectNotFound(recordControlReview(ctx, b.controlId, { outcome: "EFFECTIVE", notes: "x" }));
    await expectNotFound(mapRequirement(ctx, b.controlId, b.requirementId));
    const list = await listControls(ctx, {});
    expect(list.rows.some((r) => r.id === b.controlId)).toBe(false);
  });

  it("evidence and versions: read, update, delete, review, download are NotFound", async () => {
    const ctx = A.ctx.owner;
    await expectNotFound(getEvidenceDetail(ctx, b.evidenceId));
    await expectNotFound(updateEvidence(ctx, b.evidenceId, { title: "x x", category: "OTHER", collectedAt: "2026-09-01" }));
    await expectNotFound(deleteEvidence(ctx, b.evidenceId));
    await expectNotFound(reviewEvidence(ctx, b.evidenceId, { decision: "approve" }));
    await expectNotFound(prepareEvidenceDownload(ctx, b.evidenceId, b.versionId, "download"));
    await expectNotFound(unlinkEvidence(ctx, b.linkId));
    expect((await listEvidence(ctx, {})).rows.some((e) => e.id === b.evidenceId)).toBe(false);
  });

  it("cross-tenant links and references are rejected", async () => {
    const aControl = await controlByCode(A.org.id, "AC-01");
    const aEvidence = await uploadPdf(A.ctx.member, [], "Alpha doc");
    // A's evidence to B's control, and B's evidence to A's control.
    await expectNotFound(linkEvidence(A.ctx.member, { evidenceId: aEvidence.evidenceId, controlId: b.controlId }));
    await expectNotFound(linkEvidence(A.ctx.member, { evidenceId: b.evidenceId, controlId: aControl.id }));
    // B's requirement on A's control.
    await expectNotFound(linkEvidence(A.ctx.member, { evidenceId: aEvidence.evidenceId, controlId: aControl.id, evidenceRequirementId: b.requirementId }));
    // B users as owner / assignee in A.
    await expectNotFound(assignControlOwner(A.ctx.admin, aControl.id, { ownerId: B.users.member.id }));
    await expectNotFound(createTask(A.ctx.admin, { title: "x x x", priority: "LOW", assigneeId: B.users.member.id }));
    await expectNotFound(createTask(A.ctx.admin, { title: "x x x", priority: "LOW", controlIds: [b.controlId] }));
    await expectNotFound(createTask(A.ctx.admin, { title: "x x x", priority: "LOW", riskId: b.riskId }));
    await expectNotFound(createRisk(A.ctx.admin, { title: "x x x", kind: "RISK", severity: "LOW", ownerId: B.users.member.id }));
    await expectNotFound(createControl(A.ctx.admin, { code: "X-1", name: "Cross", description: "d", priority: "LOW", reviewFrequency: "ANNUALLY", ownerId: B.users.owner.id, requirementIds: [] }));
    // The database itself rejects a cross-tenant join row (composite foreign key).
    await expect(
      db.controlEvidence.create({ data: { organizationId: A.org.id, controlId: b.controlId, evidenceId: aEvidence.evidenceId, linkedById: A.users.owner.id } }),
    ).rejects.toThrow();
  });

  it("tasks and risks are NotFound across tenants", async () => {
    const ctx = A.ctx.owner;
    await expectNotFound(getTaskDetail(ctx, b.taskId));
    await expectNotFound(updateTask(ctx, b.taskId, { title: "hacked", priority: "LOW" }));
    await expectNotFound(assignTask(ctx, b.taskId, { assigneeId: A.users.member.id }));
    await expectNotFound(changeTaskStatus(ctx, b.taskId, { status: "DONE" }));
    await expectNotFound(deleteTask(ctx, b.taskId));
    await expectNotFound(getRiskDetail(ctx, b.riskId));
    await expectNotFound(updateRisk(ctx, b.riskId, { title: "hacked", kind: "RISK", severity: "LOW" }));
    await expectNotFound(changeRiskStatus(ctx, b.riskId, { status: "CLOSED", resolutionNotes: "x" }));
    await expectNotFound(archiveRisk(ctx, b.riskId));
    expect(await db.task.count({ where: { id: b.taskId } })).toBe(1);
  });

  it("members, invitations, notifications and audit events are scoped", async () => {
    const ctx = A.ctx.owner;
    expect((await listMembers(ctx)).some((m) => m.user.id === B.users.member.id)).toBe(false);
    await expectNotFound(changeMemberRole(ctx, b.memberId, { role: "VIEWER" }));
    await expectNotFound(removeMember(ctx, b.memberId));
    expect((await listInvitations(ctx)).some((i) => i.id === b.invitationId)).toBe(false);
    await expectNotFound(revokeInvitation(ctx, b.invitationId));
    expect((await listNotifications(ctx)).items.some((n) => n.id === b.notificationId)).toBe(false);
    await expectNotFound(markNotificationRead(ctx, b.notificationId));
    expect((await listAuditEvents(ctx, {})).items.some((e) => e.id === b.auditEventId)).toBe(false);
    await expectNotFound(getAuditEvent(ctx, b.auditEventId));
  });

  it("search never returns another organization's records", async () => {
    const results = await searchOrganization(A.ctx.owner, "Bravo");
    expect(Object.values(results).flat()).toEqual([]);
    const own = await searchOrganization(B.ctx.owner, "Bravo secret");
    expect(own.tasks.length + own.risks.length).toBe(2);
  });

  describe("route handlers", () => {
    async function cookieFor(email: string) {
      const { token } = await login({ email, password: TEST_PASSWORD }, testRequest({ ip: `198.51.100.${Math.floor(Math.random() * 200)}` }));
      return `${SESSION_COOKIE}=${token}`;
    }
    const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

    it("download: another tenant's file is 404; members including Viewers can download their own", async () => {
      const cookie = await cookieFor(A.users.owner.email);
      const url = `http://localhost:3000/api/org/${B.org.slug}/evidence/${b.evidenceId}/versions/${b.versionId}/download`;
      const cross = await downloadRoute(new Request(url, { headers: { cookie } }), params({ orgSlug: B.org.slug, evidenceId: b.evidenceId, versionId: b.versionId }));
      expect(cross.status).toBe(404);
      // Using A's own slug with B's IDs is also 404.
      const sneaky = await downloadRoute(new Request(url, { headers: { cookie } }), params({ orgSlug: A.org.slug, evidenceId: b.evidenceId, versionId: b.versionId }));
      expect(sneaky.status).toBe(404);
      const viewer = await cookieFor(B.users.viewer.email);
      const ok = await downloadRoute(new Request(url, { headers: { cookie: viewer } }), params({ orgSlug: B.org.slug, evidenceId: b.evidenceId, versionId: b.versionId }));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-security-policy")).toBe("sandbox");
      expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
      expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="Bravo policy.pdf"; filename\*=UTF-8''Bravo%20policy.pdf$/);
      expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
      const anon = await downloadRoute(new Request(url), params({ orgSlug: B.org.slug, evidenceId: b.evidenceId, versionId: b.versionId }));
      expect(anon.status).toBe(401);
    });

    it("upload: cross-tenant is 404, bad origin is 403, viewers are 403, valid upload is 201", async () => {
      const bytes = await samplePdf("route");
      const meta = (links: unknown[] = []) =>
        Buffer.from(JSON.stringify({ title: "Route upload", category: "POLICY", collectedAt: "2026-09-01", links })).toString("base64url");
      const req = (slug: string, cookie: string, origin = "http://localhost:3000", links: unknown[] = []) =>
        new Request(`http://localhost:3000/api/org/${slug}/evidence/upload`, {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/pdf", "x-file-name": "route.pdf", "x-evidence-metadata": meta(links) },
          body: bytes,
        });
      const aMember = await cookieFor(A.users.member.email);
      expect((await uploadRoute(req(B.org.slug, aMember), params({ orgSlug: B.org.slug }))).status).toBe(404);
      expect((await uploadRoute(req(A.org.slug, aMember, "https://evil.example"), params({ orgSlug: A.org.slug }))).status).toBe(403);
      const aViewer = await cookieFor(A.users.viewer.email);
      expect((await uploadRoute(req(A.org.slug, aViewer), params({ orgSlug: A.org.slug }))).status).toBe(403);
      // Linking to B's control from A's upload route is rejected.
      expect((await uploadRoute(req(A.org.slug, aMember, undefined, [{ controlId: b.controlId }]), params({ orgSlug: A.org.slug }))).status).toBe(404);
      const ok = await uploadRoute(req(A.org.slug, aMember), params({ orgSlug: A.org.slug }));
      expect(ok.status).toBe(201);
      const body = (await ok.json()) as { evidenceId: string };
      expect((await db.evidence.findUniqueOrThrow({ where: { id: body.evidenceId } })).organizationId).toBe(A.org.id);
    });

    it("export: cross-tenant is 404; Members get 403; Admins get only their own events", async () => {
      const aAdmin = await cookieFor(A.users.admin.email);
      const url = (slug: string) => `http://localhost:3000/api/org/${slug}/audit-log/export`;
      expect((await exportRoute(new Request(url(B.org.slug), { headers: { cookie: aAdmin } }), params({ orgSlug: B.org.slug }))).status).toBe(404);
      const aMember = await cookieFor(A.users.member.email);
      expect((await exportRoute(new Request(url(A.org.slug), { headers: { cookie: aMember } }), params({ orgSlug: A.org.slug }))).status).toBe(403);
      const res = await exportRoute(new Request(url(A.org.slug), { headers: { cookie: aAdmin } }), params({ orgSlug: A.org.slug }));
      expect(res.status).toBe(200);
      const csv = await res.text();
      expect(csv.split("\r\n")[0]).toMatch(/^sequence,occurredAt,actorName/);
      expect(csv).not.toContain("Bravo");
      expect(await db.auditEvent.count({ where: { organizationId: A.org.id, action: "audit_log.exported" } })).toBe(1);
    });
  });
});
