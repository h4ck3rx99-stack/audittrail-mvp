import "server-only";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, RateLimitedError, ValidationError, isUniqueViolation } from "@/server/errors";
import { enforceRateLimit, hitRateLimit } from "@/server/rate-limit";
import { withAuditedTransaction, type AuditScope } from "@/server/audit/record";
import { diffFields } from "@/server/audit/diff";
import type { RequestMeta } from "@/server/request-meta";
import type { SessionUser, UserContext } from "@/server/context";
import { absoluteUrl, sendEmail } from "@/server/email";
import { logger } from "@/server/logger";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  updateProfileSchema,
} from "@/features/auth/schemas";
import { parseInput } from "@/server/validation";
import { uuidv7 } from "@/server/ids";
import { hashPassword, passwordPolicyProblem, verifyAgainstDummy, verifyPassword } from "./password";
import { createSession, revokeSessionById, revokeUserSessions } from "./session";
import { generateToken, hashToken, looksLikeToken } from "./tokens";

export const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_PURPOSE = "password_reset";

function userScope(user: SessionUser, request: RequestMeta | null): AuditScope {
  return { actor: { type: "USER", user, role: null }, request, organizationId: null };
}

function ipKey(request: RequestMeta | null) {
  return request?.ip ?? "unknown";
}

// ─── Sign up ────────────────────────────────────────────────────────────────

export async function signUp(raw: unknown, request: RequestMeta) {
  const input = parseInput(signUpSchema, raw);
  const problem = passwordPolicyProblem(input.password, input.email);
  if (problem) throw new ValidationError("Choose a stronger password.", { password: [problem] });

  await enforceRateLimit("signupPerIp", ipKey(request), "Too many sign-up attempts. Try again later.");

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new ValidationError("An account with this email already exists.", {
      email: ["An account with this email already exists. Sign in instead."],
    });
  }

  const passwordHash = await hashPassword(input.password);
  const user: SessionUser = { id: uuidv7(), email: input.email, name: input.name };
  try {
    return await withAuditedTransaction(userScope(user, request), async ({ tx, audit }) => {
        await tx.user.create({ data: { id: user.id, email: user.email, name: user.name } });
        await tx.account.create({ data: { userId: user.id, passwordHash } });
        const session = await createSession(tx, user.id, request);
        await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit.record({
          action: "user.signed_up",
          resourceType: "user",
          resourceId: user.id,
          resourceLabel: user.email,
          chain: { userId: user.id },
        });
        await audit.record({
          action: "user.logged_in",
          resourceType: "session",
          resourceId: session.sessionId,
          resourceLabel: user.email,
          chain: { userId: user.id },
          metadata: { method: "signup" },
        });
        return { user, token: session.token, sessionId: session.sessionId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError("An account with this email already exists.", {
        email: ["An account with this email already exists. Sign in instead."],
      });
    }
    throw error;
  }
}

// ─── Log in / log out ───────────────────────────────────────────────────────

export async function login(raw: unknown, request: RequestMeta) {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(GENERIC_LOGIN_ERROR);
  const { email, password } = parsed.data;

  const limits = await Promise.all([
    hitRateLimit("loginPerIp", ipKey(request)),
    hitRateLimit("loginPerIpEmail", `${ipKey(request)}:${email}`),
    hitRateLimit("loginPerEmail", email),
  ]);
  const blocked = limits.find((l) => !l.allowed);
  if (blocked) {
    throw new RateLimitedError(blocked.retryAfterSeconds, "Too many sign-in attempts. Wait a minute and try again.");
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, account: { select: { passwordHash: true } } },
  });

  const ok = user?.account
    ? await verifyPassword(password, user.account.passwordHash)
    : await verifyAgainstDummy(password);

  if (!user || !ok) {
    if (user) {
      const sessionUser = { id: user.id, email: user.email, name: user.name };
      await withAuditedTransaction(userScope(sessionUser, request), async ({ audit }) => {
        await audit.record({
          action: "user.login_failed",
          resourceType: "user",
          resourceId: user.id,
          resourceLabel: user.email,
          chain: { userId: user.id },
          metadata: { reason: "invalid_password" },
        });
      });
    }
    throw new ValidationError(GENERIC_LOGIN_ERROR);
  }

  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name };
  return withAuditedTransaction(userScope(sessionUser, request), async ({ tx, audit }) => {
    const session = await createSession(tx, user.id, request);
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit.record({
      action: "user.logged_in",
      resourceType: "session",
      resourceId: session.sessionId,
      resourceLabel: user.email,
      chain: { userId: user.id },
      metadata: { method: "password" },
    });
    // Let organization admins see member sign-ins in their own chain.
    const memberships = await tx.organizationMember.findMany({
      where: { userId: user.id },
      select: { organizationId: true, role: true },
      orderBy: { organizationId: "asc" },
    });
    for (const m of memberships) {
      await audit.record({
        action: "member.logged_in",
        resourceType: "member",
        resourceId: user.id,
        resourceLabel: user.name,
        chain: { organizationId: m.organizationId },
        actorRole: m.role,
      });
    }
    return { user: sessionUser, token: session.token, sessionId: session.sessionId };
  });
}

export async function logout(ctx: UserContext) {
  if (!ctx.sessionId) return;
  const sessionId = ctx.sessionId;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const count = await revokeSessionById(tx, sessionId);
    if (count === 0) return;
    await audit.record({
      action: "user.logged_out",
      resourceType: "session",
      resourceId: sessionId,
      resourceLabel: ctx.user.email,
      chain: { userId: ctx.user.id },
    });
  });
}

// ─── Password reset ─────────────────────────────────────────────────────────

/**
 * Always resolves without revealing whether the account exists. When it does, a single-use
 * token (stored only as an HMAC) valid for 30 minutes is emailed.
 */
export async function requestPasswordReset(raw: unknown, request: RequestMeta): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Enter a valid email address.", { email: ["Enter a valid email address."] });
  const { email } = parsed.data;

  const [perEmail, perIp] = await Promise.all([
    hitRateLimit("passwordResetPerEmail", email),
    hitRateLimit("passwordResetPerIp", ipKey(request)),
  ]);
  // Over the limit: silently do nothing so the response stays generic.
  if (!perEmail.allowed || !perIp.allowed) return;

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user) return;

  const token = generateToken();
  await withAuditedTransaction(userScope(user, request), async ({ tx, audit, afterCommit }) => {
    const now = new Date();
    await tx.verification.updateMany({
      where: { userId: user.id, purpose: PASSWORD_RESET_PURPOSE, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.verification.create({
      data: {
        userId: user.id,
        purpose: PASSWORD_RESET_PURPOSE,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    });
    await audit.record({
      action: "user.password_reset_requested",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      chain: { userId: user.id },
    });
    afterCommit(() => {
      // Not awaited: response timing must not depend on email delivery.
      void sendEmail({
        to: user.email,
        subject: "Reset your AuditTrail password",
        text: [
          `Hi ${user.name},`,
          "",
          "Someone (hopefully you) asked to reset the password for your AuditTrail account.",
          "This link works once and expires in 30 minutes:",
          "",
          absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`),
          "",
          "If you did not ask for this, you can ignore this email. Your password has not changed.",
        ].join("\n"),
      });
    });
  });
}

export async function resetPassword(raw: unknown, request: RequestMeta) {
  const input = parseInput(resetPasswordSchema, raw);
  const invalid = new ValidationError("This reset link is invalid or has expired. Request a new one.");
  if (!looksLikeToken(input.token)) throw invalid;

  const verification = await db.verification.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: {
      id: true,
      purpose: true,
      consumedAt: true,
      expiresAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (
    !verification ||
    verification.purpose !== PASSWORD_RESET_PURPOSE ||
    verification.consumedAt ||
    verification.expiresAt.getTime() <= Date.now()
  ) {
    throw invalid;
  }
  const user = verification.user;
  const problem = passwordPolicyProblem(input.password, user.email);
  if (problem) throw new ValidationError("Choose a stronger password.", { password: [problem] });
  const passwordHash = await hashPassword(input.password);

  await withAuditedTransaction(userScope(user, request), async ({ tx, audit }) => {
    // Conditional update makes the token single-use even under concurrent submissions.
    const consumed = await tx.verification.updateMany({
      where: { id: verification.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid;
    await tx.account.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      update: { passwordHash },
    });
    const revoked = await revokeUserSessions(tx, user.id);
    await audit.record({
      action: "user.password_reset_completed",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      chain: { userId: user.id },
    });
    if (revoked > 0) {
      await audit.record({
        action: "session.revoked",
        resourceType: "session",
        resourceLabel: user.email,
        chain: { userId: user.id },
        metadata: { count: revoked, reason: "password_reset" },
      });
    }
  });
  return { email: user.email };
}

// ─── Account self-service ───────────────────────────────────────────────────

export async function changePassword(ctx: UserContext, raw: unknown) {
  const input = parseInput(changePasswordSchema, raw);
  const account = await db.account.findUnique({ where: { userId: ctx.user.id }, select: { passwordHash: true } });
  if (!account || !(await verifyPassword(input.currentPassword, account.passwordHash))) {
    throw new ValidationError("Your current password is incorrect.", {
      currentPassword: ["Your current password is incorrect."],
    });
  }
  if (input.currentPassword === input.newPassword) {
    throw new ValidationError("Choose a new password.", { newPassword: ["The new password must be different."] });
  }
  const problem = passwordPolicyProblem(input.newPassword, ctx.user.email);
  if (problem) throw new ValidationError("Choose a stronger password.", { newPassword: [problem] });
  const passwordHash = await hashPassword(input.newPassword);

  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.account.update({ where: { userId: ctx.user.id }, data: { passwordHash } });
    const revoked = await revokeUserSessions(tx, ctx.user.id, ctx.sessionId);
    await audit.record({
      action: "user.password_changed",
      resourceType: "user",
      resourceId: ctx.user.id,
      resourceLabel: ctx.user.email,
      chain: { userId: ctx.user.id },
    });
    if (revoked > 0) {
      await audit.record({
        action: "session.revoked",
        resourceType: "session",
        resourceLabel: ctx.user.email,
        chain: { userId: ctx.user.id },
        metadata: { count: revoked, reason: "password_change" },
      });
    }
  });
}

export async function revokeOwnSession(ctx: UserContext, sessionId: string) {
  const session = await db.session.findFirst({
    where: { id: sessionId, userId: ctx.user.id },
    select: { id: true, revokedAt: true },
  });
  if (!session) throw new NotFoundError("Session not found.");
  if (session.revokedAt) throw new ConflictError("This session was already revoked.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const count = await revokeSessionById(tx, session.id);
    if (count === 0) throw new ConflictError("This session was already revoked.");
    await audit.record({
      action: "session.revoked",
      resourceType: "session",
      resourceId: session.id,
      resourceLabel: ctx.user.email,
      chain: { userId: ctx.user.id },
      metadata: { count: 1, reason: "manual", current: session.id === ctx.sessionId },
    });
  });
}

export async function updateProfile(ctx: UserContext, raw: unknown) {
  const input = parseInput(updateProfileSchema, raw);
  const before = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { name: true } });
  const changes = diffFields(before, input, ["name"]);
  if (Object.keys(changes).length === 0) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.user.update({ where: { id: ctx.user.id }, data: { name: input.name } });
    await audit.record({
      action: "user.profile_updated",
      resourceType: "user",
      resourceId: ctx.user.id,
      resourceLabel: ctx.user.email,
      chain: { userId: ctx.user.id },
      changes,
    });
  });
}

export async function listOwnSessions(ctx: UserContext) {
  const sessions = await db.session.findMany({
    where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: "desc" },
    select: { id: true, createdAt: true, lastActiveAt: true, ipAddress: true, userAgent: true, expiresAt: true },
  });
  return sessions.map((s) => ({ ...s, current: s.id === ctx.sessionId }));
}

export async function listOwnSignInHistory(ctx: UserContext, limit = 50) {
  return db.auditEvent.findMany({
    where: { chainKey: `user:${ctx.user.id}` },
    orderBy: { sequence: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      occurredAt: true,
      ipAddress: true,
      userAgent: true,
      actorName: true,
      actorType: true,
      resourceLabel: true,
      changes: true,
      metadata: true,
    },
  });
}

export function logAuthError(error: unknown, requestId: string) {
  logger.warn({ err: error, requestId }, "auth operation failed");
}
