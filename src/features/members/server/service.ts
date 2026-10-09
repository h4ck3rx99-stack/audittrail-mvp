import "server-only";
import { randomUUID } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { assertCan, ROLE_LABELS } from "@/server/authz/permissions";
import {
  withAuditedTransaction,
  type AuditedTransactionHelpers,
  type AuditScope,
} from "@/server/audit/record";
import { parseInput } from "@/server/validation";
import type { OrgContext, UserContext } from "@/server/context";
import { assertUuid } from "@/server/tenancy";
import { enforceRateLimit } from "@/server/rate-limit";
import { generateToken, hashToken, looksLikeToken } from "@/server/auth/tokens";
import { absoluteUrl, sendEmail } from "@/server/email";
import { taskKey, riskKey } from "@/lib/utils";
import { changeRoleSchema, inviteSchema } from "../schemas";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function invitationState(
  inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): InvitationState {
  if (inv.acceptedAt) return "ACCEPTED";
  if (inv.revokedAt) return "REVOKED";
  if (inv.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function listMembers(ctx: OrgContext) {
  const [members, owned, openTasks] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: ctx.org.id },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        title: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.control.groupBy({
      by: ["ownerId"],
      where: { organizationId: ctx.org.id, archivedAt: null, ownerId: { not: null } },
      _count: true,
    }),
    db.task.groupBy({
      by: ["assigneeId"],
      where: {
        organizationId: ctx.org.id,
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
        assigneeId: { not: null },
      },
      _count: true,
    }),
  ]);
  const ownedBy = new Map(owned.map((o) => [o.ownerId, o._count]));
  const tasksBy = new Map(openTasks.map((t) => [t.assigneeId, t._count]));
  return members.map((m) => ({
    ...m,
    controlsOwned: ownedBy.get(m.user.id) ?? 0,
    openTasks: tasksBy.get(m.user.id) ?? 0,
  }));
}

/** Members for owner/assignee pickers. */
export async function listMemberOptions(ctx: OrgContext) {
  const rows = await db.organizationMember.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { user: { name: "asc" } },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name, email: r.user.email, role: r.role }));
}

async function lockOwnerCount(tx: Tx, organizationId: string): Promise<number> {
  // Lock the owner rows so concurrent demotions/removals cannot leave the org without an Owner.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "OrganizationMember" WHERE "organizationId" = ${organizationId} AND role = 'OWNER' FOR UPDATE
  `;
  return rows.length;
}

async function loadMembership(ctx: OrgContext, memberId: unknown) {
  assertUuid(memberId, "Member");
  const m = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId: ctx.org.id },
    select: { id: true, role: true, userId: true, user: { select: { name: true, email: true } } },
  });
  if (!m) throw new NotFoundError("Member not found.");
  return m;
}

export async function changeMemberRole(ctx: OrgContext, memberId: unknown, raw: unknown) {
  const target = await loadMembership(ctx, memberId);
  const { role } = parseInput(changeRoleSchema, raw);
  if (role === target.role) return;
  const owners = await db.organizationMember.count({
    where: { organizationId: ctx.org.id, role: "OWNER" },
  });
  assertCan(ctx, "member.changeRole", {
    targetRole: target.role,
    newRole: role,
    isLastOwner: target.role === "OWNER" && owners <= 1,
  });

  await withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    const lockedOwners = await lockOwnerCount(tx, ctx.org.id);
    if (target.role === "OWNER" && role !== "OWNER" && lockedOwners <= 1) {
      throw new ConflictError(
        "The last Owner cannot be demoted. Make someone else an Owner first.",
      );
    }
    const res = await tx.organizationMember.updateMany({
      where: { id: target.id, organizationId: ctx.org.id, role: target.role },
      data: { role },
    });
    if (res.count === 0)
      throw new ConflictError("This member was changed by someone else. Reload and try again.");
    await audit.record({
      action: "member.role_changed",
      resourceType: "member",
      resourceId: target.userId,
      resourceLabel: target.user.name,
      changes: { role: { from: target.role, to: role } },
      metadata: { membershipId: target.id, email: target.user.email },
    });
    await notify({
      type: "MEMBER_ROLE_CHANGED",
      organizationId: ctx.org.id,
      recipientId: target.userId,
      payload: {
        orgSlug: ctx.org.slug,
        orgName: ctx.org.name,
        fromRole: target.role,
        toRole: role,
        actorName: ctx.user.name,
      },
    });
  });
}

/**
 * Clears ownership and assignments held by a departing member, recording an event for every
 * affected resource (sharing one correlation ID).
 */
async function releaseAssignments(
  ctx: OrgContext,
  { tx, audit }: AuditedTransactionHelpers,
  userId: string,
  userName: string,
  correlationId: string,
) {
  const controls = await tx.control.findMany({
    where: { organizationId: ctx.org.id, ownerId: userId },
    select: { id: true, code: true },
  });
  for (const c of controls) {
    await tx.control.updateMany({
      where: { id: c.id, organizationId: ctx.org.id },
      data: { ownerId: null, version: { increment: 1 } },
    });
    await audit.record({
      action: "control.owner_changed",
      resourceType: "control",
      resourceId: c.id,
      resourceLabel: c.code,
      changes: { ownerId: { from: userId, to: null } },
      metadata: { fromName: userName, toName: null, correlationId, reason: "member_departed" },
    });
  }
  const tasks = await tx.task.findMany({
    where: {
      organizationId: ctx.org.id,
      assigneeId: userId,
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
    },
    select: { id: true, number: true },
  });
  for (const t of tasks) {
    await tx.task.updateMany({
      where: { id: t.id, organizationId: ctx.org.id },
      data: { assigneeId: null },
    });
    await audit.record({
      action: "task.assigned",
      resourceType: "task",
      resourceId: t.id,
      resourceLabel: taskKey(t.number),
      changes: { assigneeId: { from: userId, to: null } },
      metadata: { fromName: userName, toName: null, correlationId, reason: "member_departed" },
    });
  }
  const risks = await tx.risk.findMany({
    where: { organizationId: ctx.org.id, ownerId: userId, archivedAt: null },
    select: { id: true, number: true },
  });
  for (const r of risks) {
    await tx.risk.updateMany({
      where: { id: r.id, organizationId: ctx.org.id },
      data: { ownerId: null },
    });
    await audit.record({
      action: "risk.updated",
      resourceType: "risk",
      resourceId: r.id,
      resourceLabel: riskKey(r.number),
      changes: { ownerId: { from: userId, to: null } },
      metadata: { correlationId, reason: "member_departed" },
    });
  }
  return { controls: controls.length, tasks: tasks.length, risks: risks.length };
}

export async function removeMember(ctx: OrgContext, memberId: unknown) {
  const target = await loadMembership(ctx, memberId);
  const owners = await db.organizationMember.count({
    where: { organizationId: ctx.org.id, role: "OWNER" },
  });
  assertCan(ctx, "member.remove", {
    targetRole: target.role,
    targetUserId: target.userId,
    isLastOwner: target.role === "OWNER" && owners <= 1,
  });
  const correlationId = randomUUID();
  await withAuditedTransaction(ctx, async (helpers) => {
    const lockedOwners = await lockOwnerCount(helpers.tx, ctx.org.id);
    if (target.role === "OWNER" && lockedOwners <= 1)
      throw new ConflictError("The last Owner cannot be removed.");
    const released = await releaseAssignments(
      ctx,
      helpers,
      target.userId,
      target.user.name,
      correlationId,
    );
    const res = await helpers.tx.organizationMember.deleteMany({
      where: { id: target.id, organizationId: ctx.org.id },
    });
    if (res.count === 0) throw new NotFoundError("Member not found.");
    await helpers.audit.record({
      action: "member.removed",
      resourceType: "member",
      resourceId: target.userId,
      resourceLabel: target.user.name,
      metadata: { email: target.user.email, role: target.role, correlationId, released },
    });
  });
}

export async function leaveOrganization(ctx: OrgContext) {
  const owners = await db.organizationMember.count({
    where: { organizationId: ctx.org.id, role: "OWNER" },
  });
  assertCan(ctx, "member.leave", { isLastOwner: ctx.role === "OWNER" && owners <= 1 });
  const correlationId = randomUUID();
  await withAuditedTransaction(ctx, async (helpers) => {
    const lockedOwners = await lockOwnerCount(helpers.tx, ctx.org.id);
    if (ctx.role === "OWNER" && lockedOwners <= 1) {
      throw new ConflictError("You are the last Owner. Make someone else an Owner before leaving.");
    }
    const released = await releaseAssignments(
      ctx,
      helpers,
      ctx.user.id,
      ctx.user.name,
      correlationId,
    );
    await helpers.tx.organizationMember.deleteMany({
      where: { id: ctx.membership.id, organizationId: ctx.org.id },
    });
    await helpers.audit.record({
      action: "member.left",
      resourceType: "member",
      resourceId: ctx.user.id,
      resourceLabel: ctx.user.name,
      metadata: { role: ctx.role, correlationId, released },
    });
  });
}

// ─── Invitations ────────────────────────────────────────────────────────────

export async function listInvitations(ctx: OrgContext) {
  assertCan(ctx, "invitation.revoke");
  const rows = await db.invitation.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedBy: { select: { name: true } },
      acceptedBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, state: invitationState(r) }));
}

function invitationEmail(orgName: string, inviterName: string, role: Role, token: string) {
  return {
    subject: `${inviterName} invited you to ${orgName} on AuditTrail`,
    text: [
      `${inviterName} invited you to join ${orgName} on AuditTrail as ${ROLE_LABELS[role]}.`,
      "",
      "Accept the invitation (the link works once and expires in 7 days):",
      absoluteUrl(`/invite/${token}`),
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
  };
}

export async function createInvitation(ctx: OrgContext, raw: unknown) {
  const input = parseInput(inviteSchema, raw);
  assertCan(ctx, "member.invite", { role: input.role });
  await enforceRateLimit(
    "invitationsPerOrg",
    ctx.org.id,
    "Too many invitations from this organization. Try again later.",
  );

  const existingMember = await db.organizationMember.findFirst({
    where: { organizationId: ctx.org.id, user: { email: input.email } },
    select: { id: true },
  });
  if (existingMember)
    throw new ValidationError("This person is already a member.", {
      email: ["This person is already a member."],
    });
  const pending = await db.invitation.findFirst({
    where: {
      organizationId: ctx.org.id,
      email: input.email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (pending) {
    throw new ValidationError("An invitation is already pending for this email.", {
      email: ["An invitation is already pending. Regenerate its link from the list instead."],
    });
  }

  const token = generateToken();
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  const invitation = await withAuditedTransaction(
    ctx,
    async ({ tx, audit, notify, afterCommit }) => {
      const inv = await tx.invitation.create({
        data: {
          organizationId: ctx.org.id,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedById: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      await audit.record({
        action: "invitation.created",
        resourceType: "invitation",
        resourceId: inv.id,
        resourceLabel: inv.email,
        metadata: { role: inv.role, expiresAt: inv.expiresAt.toISOString() },
      });
      if (existingUser) {
        await notify({
          type: "INVITATION_RECEIVED",
          organizationId: ctx.org.id,
          recipientId: existingUser.id,
          payload: { orgName: ctx.org.name, role: inv.role, inviterName: ctx.user.name },
        });
      }
      afterCommit(() =>
        sendEmail({
          to: inv.email,
          ...invitationEmail(ctx.org.name, ctx.user.name, inv.role, token),
        }),
      );
      return inv;
    },
  );
  return { invitationId: invitation.id, link: absoluteUrl(`/invite/${token}`) };
}

async function loadInvitation(ctx: OrgContext, invitationId: unknown) {
  assertUuid(invitationId, "Invitation");
  const inv = await db.invitation.findFirst({
    where: { id: invitationId, organizationId: ctx.org.id },
  });
  if (!inv) throw new NotFoundError("Invitation not found.");
  return inv;
}

export async function revokeInvitation(ctx: OrgContext, invitationId: unknown) {
  assertCan(ctx, "invitation.revoke");
  const inv = await loadInvitation(ctx, invitationId);
  if (inv.acceptedAt) throw new ConflictError("This invitation was already accepted.");
  if (inv.revokedAt) throw new ConflictError("This invitation was already revoked.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.invitation.updateMany({
      where: { id: inv.id, organizationId: ctx.org.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit.record({
      action: "invitation.revoked",
      resourceType: "invitation",
      resourceId: inv.id,
      resourceLabel: inv.email,
      metadata: { role: inv.role },
    });
  });
}

/** Issues a fresh single-use link (and expiry) for a pending or expired invitation. */
export async function regenerateInvitationLink(ctx: OrgContext, invitationId: unknown) {
  const inv = await loadInvitation(ctx, invitationId);
  assertCan(ctx, "member.invite", { role: inv.role });
  if (inv.acceptedAt) throw new ConflictError("This invitation was already accepted.");
  if (inv.revokedAt)
    throw new ConflictError("This invitation was revoked. Send a new invitation instead.");
  await enforceRateLimit(
    "invitationsPerOrg",
    ctx.org.id,
    "Too many invitations from this organization. Try again later.",
  );
  const token = generateToken();
  await withAuditedTransaction(ctx, async ({ tx, audit, afterCommit }) => {
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await tx.invitation.updateMany({
      where: { id: inv.id, organizationId: ctx.org.id },
      data: { tokenHash: hashToken(token), expiresAt },
    });
    await audit.record({
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: inv.id,
      resourceLabel: inv.email,
      metadata: { role: inv.role, regenerated: true, expiresAt: expiresAt.toISOString() },
    });
    afterCommit(() =>
      sendEmail({
        to: inv.email,
        ...invitationEmail(ctx.org.name, ctx.user.name, inv.role, token),
      }),
    );
  });
  return { link: absoluteUrl(`/invite/${token}`) };
}

/** Public lookup for /invite/[token]: what the invitation is for and whether it is usable. */
export async function getInvitationByToken(token: unknown) {
  if (!looksLikeToken(token)) return null;
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true, slug: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (!inv) return null;
  return { ...inv, state: invitationState(inv) };
}

/**
 * Accepts an invitation. Requires the token (proof of access to the invited mailbox, since email
 * verification is not enforced in the MVP) and a signed-in user whose email matches.
 */
export async function acceptInvitation(userCtx: UserContext, token: unknown) {
  const invalid = new ValidationError(
    "This invitation link is invalid or has expired. Ask for a new one.",
  );
  if (!looksLikeToken(token)) throw invalid;
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      organization: { select: { slug: true, name: true } },
    },
  });
  if (!inv || invitationState(inv) !== "PENDING") throw invalid;
  if (inv.email !== userCtx.user.email.toLowerCase()) {
    throw new ValidationError(
      `This invitation was sent to a different email address. Sign in as ${inv.email} to accept it.`,
    );
  }
  const already = await db.organizationMember.findFirst({
    where: { organizationId: inv.organizationId, userId: userCtx.user.id },
    select: { id: true },
  });
  if (already) throw new ConflictError("You are already a member of this organization.");

  const scope: AuditScope = {
    actor: { type: "USER", user: userCtx.user, role: inv.role },
    request: userCtx.request,
    organizationId: inv.organizationId,
    auditMetadata: userCtx.auditMetadata,
  };
  await withAuditedTransaction(scope, async ({ tx, audit }) => {
    const res = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date(), acceptedById: userCtx.user.id },
    });
    if (res.count !== 1) throw invalid;
    await tx.organizationMember.create({
      data: { organizationId: inv.organizationId, userId: userCtx.user.id, role: inv.role },
    });
    await audit.record({
      action: "invitation.accepted",
      resourceType: "invitation",
      resourceId: inv.id,
      resourceLabel: ROLE_LABELS[inv.role],
      metadata: { email: inv.email, role: inv.role },
    });
  });
  return { orgSlug: inv.organization.slug, orgName: inv.organization.name };
}

/** Pending invitations addressed to the signed-in user's email (shown after sign-up). */
export async function listMyPendingInvitations(userCtx: UserContext) {
  const rows = await db.invitation.findMany({
    where: {
      email: userCtx.user.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      organization: { select: { name: true } },
      invitedBy: { select: { name: true } },
    },
  });
  return rows;
}

/** The invitee declines an invitation addressed to their email. */
export async function declineInvitation(userCtx: UserContext, invitationId: unknown) {
  assertUuid(invitationId, "Invitation");
  const inv = await db.invitation.findFirst({
    where: {
      id: invitationId,
      email: userCtx.user.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
    },
    select: { id: true, email: true, role: true, organizationId: true },
  });
  if (!inv) throw new NotFoundError("Invitation not found.");
  const scope: AuditScope = {
    actor: { type: "USER", user: userCtx.user, role: null },
    request: userCtx.request,
    organizationId: inv.organizationId,
  };
  await withAuditedTransaction(scope, async ({ tx, audit }) => {
    await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit.record({
      action: "invitation.revoked",
      resourceType: "invitation",
      resourceId: inv.id,
      resourceLabel: inv.email,
      metadata: { role: inv.role, declinedByInvitee: true },
    });
  });
}
