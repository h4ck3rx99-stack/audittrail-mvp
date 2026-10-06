import "server-only";
import type { DbClient } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { isUuid } from "@/server/ids";

/**
 * Cross-reference verification helpers. Every ID that arrives from a client is checked to belong
 * to the caller's organization; anything else is reported as "not found".
 */

export function assertUuid(value: unknown, what = "Record"): asserts value is string {
  if (!isUuid(value)) throw new NotFoundError(`${what} not found.`);
}

/** Verifies that a user is a current member of the organization. Returns their name. */
export async function assertMember(client: DbClient, organizationId: string, userId: string): Promise<{ id: string; name: string; email: string }> {
  assertUuid(userId, "Member");
  const membership = await client.organizationMember.findFirst({
    where: { organizationId, userId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!membership) throw new NotFoundError("Member not found.");
  return membership.user;
}

export async function assertControlsInOrg(client: DbClient, organizationId: string, controlIds: readonly string[]) {
  const unique = [...new Set(controlIds)];
  unique.forEach((id) => assertUuid(id, "Control"));
  if (unique.length === 0) return [];
  const rows = await client.control.findMany({
    where: { organizationId, id: { in: unique } },
    select: { id: true, code: true, archivedAt: true },
  });
  if (rows.length !== unique.length) throw new NotFoundError("Control not found.");
  return rows;
}

/** Allocates the next human-readable number (TSK-n, RSK-n) inside the caller's transaction. */
export async function nextCounterValue(client: DbClient, organizationId: string, key: "task" | "risk"): Promise<number> {
  const rows = await client.$queryRaw<{ value: number }[]>`
    INSERT INTO "OrganizationCounter" ("organizationId", "key", "value")
    VALUES (${organizationId}, ${key}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "OrganizationCounter"."value" + 1
    RETURNING "value"
  `;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error("Counter allocation failed");
  return Number(value);
}

/** Owner and Admin user IDs (for "submitted for review" notifications). */
export async function managerIds(client: DbClient, organizationId: string): Promise<string[]> {
  const rows = await client.organizationMember.findMany({
    where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
