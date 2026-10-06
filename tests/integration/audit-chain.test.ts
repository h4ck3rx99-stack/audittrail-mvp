import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { withAuditedTransaction } from "@/server/audit/record";
import { verifyAuditChain } from "@/server/audit/verify";
import { canonicalJson, computeAuditEventHash, orgChainKey } from "@/server/audit/hash";
import { diffFields, REDACTED } from "@/server/audit/diff";
import { resetDatabase } from "../helpers/db";
import { addMember, createOrg, createUser, orgContext } from "../helpers/factories";

async function setup() {
  const org = await createOrg();
  const user = await createUser({ name: "Avery Admin" });
  await addMember(org.id, user.id, "ADMIN");
  const ctx = await orgContext(org, user);
  return { org, user, ctx };
}

describe("audit hash chain", () => {
  beforeEach(resetDatabase);

  it("canonical JSON is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
  });

  it("writes events with actor, organization, resource and request context, linked by hashes", async () => {
    const { org, user, ctx } = await setup();
    await withAuditedTransaction(ctx, async ({ audit }) => {
      await audit.record({ action: "control.created", resourceType: "control", resourceId: "c1", resourceLabel: "AC-01" });
      await audit.record({ action: "control.updated", resourceType: "control", resourceId: "c1", resourceLabel: "AC-01", changes: { name: { from: "a", to: "b" } } });
    });

    const events = await db.auditEvent.findMany({ where: { chainKey: orgChainKey(org.id) }, orderBy: { sequence: "asc" } });
    expect(events).toHaveLength(2);
    const [first, second] = events;
    expect(first!.sequence).toBe(1n);
    expect(first!.prevHash).toBeNull();
    expect(second!.sequence).toBe(2n);
    expect(second!.prevHash).toBe(first!.hash);
    expect(first).toMatchObject({
      organizationId: org.id,
      actorType: "USER",
      actorUserId: user.id,
      actorEmail: user.email,
      actorName: "Avery Admin",
      actorRole: "ADMIN",
      action: "control.created",
      resourceType: "control",
      resourceId: "c1",
      resourceLabel: "AC-01",
      ipAddress: ctx.request.ip,
      userAgent: ctx.request.userAgent,
      requestId: ctx.request.requestId,
    });
    expect(second!.changes).toEqual({ name: { from: "a", to: "b" } });

    const head = await db.auditChainHead.findUniqueOrThrow({ where: { chainKey: orgChainKey(org.id) } });
    expect(head.lastSequence).toBe(2n);
    expect(head.lastHash).toBe(second!.hash);

    const result = await verifyAuditChain(orgChainKey(org.id));
    expect(result).toEqual({ valid: true, chainKey: orgChainKey(org.id), eventCount: 2, headHash: second!.hash });
  });

  it("writes nothing when the transaction fails (rollback)", async () => {
    const { org, ctx } = await setup();
    await expect(
      withAuditedTransaction(ctx, async ({ tx, audit }) => {
        await tx.organization.update({ where: { id: org.id }, data: { name: "Changed" } });
        await audit.record({ action: "organization.updated", resourceType: "organization", resourceId: org.id, resourceLabel: "Changed" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.auditEvent.count()).toBe(0);
    expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).name).toBe(org.name);
    const head = await db.auditChainHead.findUnique({ where: { chainKey: orgChainKey(org.id) } });
    expect(head).toBeNull();
  });

  it("keeps sequence numbers contiguous under concurrent writes", async () => {
    const { org, ctx } = await setup();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withAuditedTransaction(ctx, async ({ audit }) => {
          await audit.record({ action: "task.created", resourceType: "task", resourceId: `t${i}`, resourceLabel: `TSK-${i}` });
          await audit.record({ action: "task.updated", resourceType: "task", resourceId: `t${i}`, resourceLabel: `TSK-${i}` });
        }),
      ),
    );
    const events = await db.auditEvent.findMany({ where: { chainKey: orgChainKey(org.id) }, orderBy: { sequence: "asc" } });
    expect(events.map((e) => e.sequence)).toEqual(Array.from({ length: 40 }, (_, i) => BigInt(i + 1)));
    expect((await verifyAuditChain(orgChainKey(org.id))).valid).toBe(true);
  });

  it("redacts sensitive fields in changes and metadata", async () => {
    const { org, ctx } = await setup();
    const changes = diffFields({ name: "a", passwordHash: "x" }, { name: "b", passwordHash: "y" }, ["name", "passwordHash"]);
    await withAuditedTransaction(ctx, async ({ audit }) => {
      await audit.record({
        action: "organization.updated",
        resourceType: "organization",
        resourceId: org.id,
        changes: { ...changes, apiToken: { from: "t1", to: "t2" } },
        metadata: { note: "ok", token: "secret-value", nested: { password: "hunter2" } },
      });
    });
    const event = await db.auditEvent.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(event.changes).toEqual({
      name: { from: "a", to: "b" },
      passwordHash: { from: REDACTED, to: REDACTED },
      apiToken: { from: REDACTED, to: REDACTED },
    });
    expect(event.metadata).toEqual({ note: "ok", token: REDACTED, nested: { password: REDACTED } });
    expect(canonicalJson(event)).not.toContain("hunter2");
    expect((await verifyAuditChain(orgChainKey(org.id))).valid).toBe(true);
  });

  it("the database rejects UPDATE and DELETE on audit events", async () => {
    const { ctx } = await setup();
    await withAuditedTransaction(ctx, async ({ audit }) => {
      await audit.record({ action: "control.created", resourceType: "control", resourceId: "c1", resourceLabel: "AC-01" });
    });
    const event = await db.auditEvent.findFirstOrThrow();
    await expect(db.auditEvent.update({ where: { id: event.id }, data: { action: "control.archived" } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "AuditEvent" SET "resourceLabel" = 'x' WHERE id = ${event.id}`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM "AuditEvent" WHERE id = ${event.id}`).rejects.toThrow(/append-only/);
    expect(await db.auditEvent.count()).toBe(1);
  });

  describe("verification detects tampering", () => {
    async function seedChain() {
      const s = await setup();
      for (let i = 1; i <= 4; i++) {
        await withAuditedTransaction(s.ctx, async ({ audit }) => {
          await audit.record({ action: "control.updated", resourceType: "control", resourceId: "c1", resourceLabel: `AC-0${i}` });
        });
      }
      return s;
    }

    /** Bypasses the append-only trigger inside a single transaction to simulate a DB-level attacker. */
    async function tamper(statement: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<unknown>) {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER audit_event_append_only`);
        await statement(tx);
        await tx.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER audit_event_append_only`);
      });
    }

    it("detects a modified event", async () => {
      const { org } = await seedChain();
      await tamper((tx) => tx.$executeRaw`UPDATE "AuditEvent" SET "resourceLabel" = 'forged' WHERE "chainKey" = ${orgChainKey(org.id)} AND sequence = 2`);
      const result = await verifyAuditChain(orgChainKey(org.id));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.brokenAtSequence).toBe("2");
        expect(result.reason).toMatch(/hash does not match/i);
      }
    });

    it("detects a deleted event in the middle (sequence gap)", async () => {
      const { org } = await seedChain();
      await tamper((tx) => tx.$executeRaw`DELETE FROM "AuditEvent" WHERE "chainKey" = ${orgChainKey(org.id)} AND sequence = 3`);
      const result = await verifyAuditChain(orgChainKey(org.id));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.brokenAtSequence).toBe("3");
    });

    it("detects a deleted event at the end (head mismatch)", async () => {
      const { org } = await seedChain();
      await tamper((tx) => tx.$executeRaw`DELETE FROM "AuditEvent" WHERE "chainKey" = ${orgChainKey(org.id)} AND sequence = 4`);
      const result = await verifyAuditChain(orgChainKey(org.id));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toMatch(/Chain head/);
    });

    it("detects a re-hashed forged event (broken prevHash link)", async () => {
      const { org } = await seedChain();
      const target = await db.auditEvent.findFirstOrThrow({ where: { chainKey: orgChainKey(org.id), sequence: 2n } });
      // An attacker recomputes the hash of the forged row but cannot fix the next row's prevHash
      // without rewriting the rest of the chain.
      const forgedHash = computeAuditEventHash({
        ...target,
        resourceLabel: "forged",
        changes: null,
        metadata: null,
      });
      await tamper((tx) => tx.$executeRaw`UPDATE "AuditEvent" SET "resourceLabel" = 'forged', hash = ${forgedHash} WHERE id = ${target.id}`);
      const result = await verifyAuditChain(orgChainKey(org.id));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.brokenAtSequence).toBe("3");
    });
  });
});
