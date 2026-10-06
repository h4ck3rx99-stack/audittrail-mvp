import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/** 32 bytes of CSPRNG output, base64url encoded (43 characters). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Tokens (sessions, password resets, invitations) are stored only as an HMAC-SHA256 keyed with
 * AUTH_SECRET. A database leak alone does not yield usable tokens.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(token, "utf8").digest("hex");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still do a comparison of equal length to avoid an early exit on length alone.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Basic shape check before touching the database. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
