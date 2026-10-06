import "server-only";
import { db, type DbClient } from "@/server/db";
import type { SessionUser } from "@/server/context";
import type { RequestMeta } from "@/server/request-meta";
import {
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_LIFETIME_MS,
  SESSION_REFRESH_INTERVAL_MS,
} from "./cookies";
import { generateToken, hashToken, looksLikeToken } from "./tokens";

export type ValidatedSession = {
  sessionId: string;
  user: SessionUser;
};

/** Creates a brand-new database session. Returns the raw token for the cookie (never stored). */
export async function createSession(client: DbClient, userId: string, meta: RequestMeta | null, now = new Date()) {
  const token = generateToken();
  const session = await client.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS),
      lastActiveAt: now,
      ipAddress: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
    select: { id: true },
  });
  return { token, sessionId: session.id };
}

/**
 * Resolves a cookie token to a user. Rejects unknown, revoked, idle-expired and absolutely
 * expired sessions. Slides the idle expiry forward at most once per day.
 */
export async function validateSessionToken(token: unknown, now = new Date()): Promise<ValidatedSession | null> {
  if (!looksLikeToken(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (session.createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS <= now.getTime()) return null;

  const refreshThreshold = SESSION_IDLE_LIFETIME_MS - SESSION_REFRESH_INTERVAL_MS;
  if (session.expiresAt.getTime() - now.getTime() < refreshThreshold) {
    await db.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { expiresAt: new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS), lastActiveAt: now },
    });
  }
  return { sessionId: session.id, user: session.user };
}

export async function revokeSessionById(client: DbClient, sessionId: string, now = new Date()) {
  const res = await client.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  return res.count;
}

/** Revokes every active session of a user, optionally keeping one (the current session). */
export async function revokeUserSessions(client: DbClient, userId: string, exceptSessionId?: string | null, now = new Date()) {
  const res = await client.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: now },
  });
  return res.count;
}
