import { randomUUID } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import type { OrgContext, SessionUser, UserContext } from "@/server/context";
import type { RequestMeta } from "@/server/request-meta";

export const TEST_PASSWORD = "correct-horse-battery-staple-42";

let cachedHash: Promise<string> | null = null;
function testPasswordHash() {
  cachedHash ??= hashPassword(TEST_PASSWORD);
  return cachedHash;
}

export function testRequest(overrides: Partial<RequestMeta> = {}): RequestMeta {
  return { ip: "203.0.113.10", userAgent: "vitest", requestId: randomUUID(), ...overrides };
}

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(
  overrides: { name?: string; email?: string } = {},
): Promise<SessionUser> {
  const id = uniq();
  const user = await db.user.create({
    data: {
      email: (overrides.email ?? `user-${id}@example.test`).toLowerCase(),
      name: overrides.name ?? `User ${id}`,
      account: { create: { passwordHash: await testPasswordHash() } },
    },
    select: { id: true, email: true, name: true },
  });
  return user;
}

export async function createOrg(
  overrides: {
    name?: string;
    slug?: string;
    requireIndependentEvidenceReview?: boolean;
    timezone?: string;
  } = {},
) {
  const id = uniq();
  return db.organization.create({
    data: {
      name: overrides.name ?? `Org ${id}`,
      slug: overrides.slug ?? `org-${id}`,
      requireIndependentEvidenceReview: overrides.requireIndependentEvidenceReview ?? true,
      timezone: overrides.timezone ?? "UTC",
    },
  });
}

export async function addMember(organizationId: string, userId: string, role: Role) {
  return db.organizationMember.create({ data: { organizationId, userId, role } });
}

export async function orgContext(
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    requireIndependentEvidenceReview: boolean;
    defaultEvidenceValidityDays: number;
    isDemo: boolean;
  },
  user: SessionUser,
): Promise<OrgContext> {
  const membership = await db.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
  });
  return {
    user,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      requireIndependentEvidenceReview: org.requireIndependentEvidenceReview,
      defaultEvidenceValidityDays: org.defaultEvidenceValidityDays,
      isDemo: org.isDemo,
    },
    membership: { id: membership.id, role: membership.role, title: membership.title },
    role: membership.role,
    request: testRequest(),
    sessionId: null,
  };
}

export function userContext(user: SessionUser, sessionId: string | null = null): UserContext {
  return { user, request: testRequest(), sessionId };
}

/** An organization with one member per role, and their contexts. */
export async function createOrgWithRoles(name?: string) {
  const org = await createOrg(name ? { name } : {});
  const owner = await createUser({ name: `${org.name} Owner` });
  const admin = await createUser({ name: `${org.name} Admin` });
  const member = await createUser({ name: `${org.name} Member` });
  const member2 = await createUser({ name: `${org.name} Member Two` });
  const viewer = await createUser({ name: `${org.name} Viewer` });
  await addMember(org.id, owner.id, "OWNER");
  await addMember(org.id, admin.id, "ADMIN");
  await addMember(org.id, member.id, "MEMBER");
  await addMember(org.id, member2.id, "MEMBER");
  await addMember(org.id, viewer.id, "VIEWER");
  return {
    org,
    users: { owner, admin, member, member2, viewer },
    ctx: {
      owner: await orgContext(org, owner),
      admin: await orgContext(org, admin),
      member: await orgContext(org, member),
      member2: await orgContext(org, member2),
      viewer: await orgContext(org, viewer),
    },
  };
}

export type OrgFixture = Awaited<ReturnType<typeof createOrgWithRoles>>;

export async function auditEventsFor(organizationId: string) {
  return db.auditEvent.findMany({ where: { organizationId }, orderBy: { sequence: "asc" } });
}
