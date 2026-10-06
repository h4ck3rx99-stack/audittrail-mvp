import "server-only";
import { db } from "@/server/db";
import { RateLimitedError } from "@/server/errors";

/**
 * Database-backed fixed-window rate limiting. The counter is incremented atomically with a
 * single INSERT ... ON CONFLICT statement, so limits hold across multiple app instances.
 */

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIpEmail: { limit: 5, windowSeconds: 60 },
  loginPerIp: { limit: 20, windowSeconds: 60 },
  /** Extra guard so rotating spoofed IPs cannot bypass the per-account limit. */
  loginPerEmail: { limit: 10, windowSeconds: 60 },
  signupPerIp: { limit: 5, windowSeconds: 3600 },
  passwordResetPerEmail: { limit: 3, windowSeconds: 3600 },
  passwordResetPerIp: { limit: 20, windowSeconds: 3600 },
  uploadsPerUser: { limit: 30, windowSeconds: 60 },
  invitationsPerOrg: { limit: 20, windowSeconds: 3600 },
  searchPerUser: { limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

export async function hitRateLimit(
  name: RateLimitName,
  identifier: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const key = `${name}:${identifier}`.slice(0, 512);
  const windowMs = rule.windowSeconds * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" <= ${cutoff} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" <= ${cutoff} THEN ${now} ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"
  `;
  const row = rows[0];
  if (!row) return { allowed: true, count: 1, retryAfterSeconds: 0 };
  const count = Number(row.count);
  const resetAt = new Date(row.windowStart).getTime() + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
  return { allowed: count <= rule.limit, count, retryAfterSeconds };
}

/** Increments the counter and throws RateLimitedError when the limit is exceeded. */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string,
  message?: string,
): Promise<void> {
  const result = await hitRateLimit(name, identifier);
  if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds, message);
}

/** Opportunistic cleanup of stale buckets (called by the compliance scan job). */
export async function pruneRateLimitBuckets(olderThanSeconds = 86_400): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return result.count;
}
