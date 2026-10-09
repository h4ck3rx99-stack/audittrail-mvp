import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { runComplianceScan } from "@/server/jobs/compliance-scan";
import {
  listNotifications,
  markAllNotificationsRead,
  unreadNotificationCount,
} from "@/features/notifications/server/service";
import { escapeLike, searchOrganization } from "@/features/search/server/service";
import { createTask } from "@/features/tasks/server/service";
import { reviewEvidence } from "@/features/evidence/server/service";
import { assignControlOwner } from "@/features/controls/server/service";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { POST as cronRoute } from "@/app/api/cron/compliance-scan/route";
import { resetDatabase } from "../helpers/db";
import { createOrgWithRoles, type OrgFixture } from "../helpers/factories";
import { adoptSoc2, controlByCode, uploadPdf } from "../helpers/fixtures";

let f: OrgFixture;

describe("notifications", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
    await adoptSoc2(f.ctx.admin);
  });

  it("go to the right recipients and never to the actor", async () => {
    await uploadPdf(f.ctx.admin);
    // Submitted for review: Owners and Admins except the uploader.
    const recipients = (
      await db.notification.findMany({ where: { type: "EVIDENCE_SUBMITTED_FOR_REVIEW" } })
    ).map((n) => n.recipientId);
    expect(recipients).toEqual([f.users.owner.id]);

    const { evidenceId } = await uploadPdf(f.ctx.member);
    await reviewEvidence(f.ctx.admin, evidenceId, { decision: "reject", comment: "Missing date" });
    const reviewed = await db.notification.findFirstOrThrow({
      where: { type: "EVIDENCE_REVIEWED" },
    });
    expect(reviewed.recipientId).toBe(f.users.member.id);
    expect(reviewed.body).toContain("Missing date");
    expect(reviewed.linkPath).toBe(`/org/${f.org.slug}/evidence/${evidenceId}`);

    const c = await controlByCode(f.org.id, "AC-01");
    await assignControlOwner(f.ctx.admin, c.id, { ownerId: f.users.admin.id });
    expect(await db.notification.count({ where: { type: "CONTROL_ASSIGNED" } })).toBe(0);

    expect(await unreadNotificationCount(f.ctx.member)).toBe(1);
    await markAllNotificationsRead(f.ctx.member);
    expect(await unreadNotificationCount(f.ctx.member)).toBe(0);
    expect((await listNotifications(f.ctx.member)).items).toHaveLength(1);
  });

  it("the compliance scan is idempotent", async () => {
    const today = todayInTimeZone("UTC");
    await createTask(f.ctx.admin, {
      title: "Overdue task",
      priority: "HIGH",
      assigneeId: f.users.member.id,
      dueDate: addDays(today, -2),
    });
    await createTask(f.ctx.admin, {
      title: "Due soon task",
      priority: "LOW",
      assigneeId: f.users.member.id,
      dueDate: addDays(today, 1),
    });
    const { evidenceId } = await uploadPdf(f.ctx.member);
    await reviewEvidence(f.ctx.admin, evidenceId, {
      decision: "approve",
      validUntil: addDays(today, 10),
    });
    const before = await db.notification.count();

    const first = await runComplianceScan();
    expect(first.created).toBeGreaterThanOrEqual(3);
    const types = (await db.notification.findMany({ where: { recipientId: f.users.member.id } }))
      .map((n) => n.type)
      .sort();
    expect(types).toEqual(
      expect.arrayContaining(["TASK_OVERDUE", "TASK_DUE_SOON", "EVIDENCE_EXPIRING"]),
    );
    const afterFirst = await db.notification.count();
    expect(afterFirst - before).toBe(first.created);

    const second = await runComplianceScan();
    expect(second.created).toBe(0);
    expect(await db.notification.count()).toBe(afterFirst);
  });

  it("the cron endpoint requires the bearer secret", async () => {
    const unauthenticated = await cronRoute(
      new Request("http://localhost:3000/api/cron/compliance-scan", { method: "POST" }),
    );
    expect(unauthenticated.status).toBe(401);
    const wrong = await cronRoute(
      new Request("http://localhost:3000/api/cron/compliance-scan", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(wrong.status).toBe(401);
    const ok = await cronRoute(
      new Request("http://localhost:3000/api/cron/compliance-scan", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(ok.status).toBe(200);
  });
});

describe("search", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
    await adoptSoc2(f.ctx.admin);
  });

  it("finds controls, requirements, tasks by key, and members", async () => {
    const t = await createTask(f.ctx.admin, { title: "Rotate keys", priority: "LOW" });
    const r = await searchOrganization(f.ctx.member, "AC-01");
    expect(r.controls[0]?.title).toContain("AC-01");
    expect((await searchOrganization(f.ctx.member, "CC6.1")).requirements[0]?.title).toContain(
      "CC6.1",
    );
    expect((await searchOrganization(f.ctx.member, `TSK-${t.number}`)).tasks[0]?.id).toBe(t.id);
    expect((await searchOrganization(f.ctx.member, "Acme Viewer")).members).toHaveLength(1);
    expect(await searchOrganization(f.ctx.member, "a")).toEqual({
      controls: [],
      requirements: [],
      evidence: [],
      tasks: [],
      risks: [],
      members: [],
    });
  });

  it("escapes LIKE wildcards so they match literally", async () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
    await createTask(f.ctx.admin, { title: "Reach 100% coverage", priority: "LOW" });
    await createTask(f.ctx.admin, { title: "Reach 1000 users", priority: "LOW" });
    const pct = await searchOrganization(f.ctx.member, "100%");
    expect(pct.tasks.map((x) => x.title)).toEqual(["TSK-1 · Reach 100% coverage"]);
    const underscore = await searchOrganization(f.ctx.member, "_%");
    expect(Object.values(underscore).flat()).toEqual([]);
  });
});
