import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SESSION_COOKIE } from "./cookies";
import { validateSessionToken, type ValidatedSession } from "./session";

/** Resolves the session cookie for the current request. Memoized per request. */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/**
 * Requires an authenticated user. Redirects to /login?next=<current path> otherwise.
 * The current path comes from a header set by the proxy and is re-validated as a same-origin
 * relative path before use.
 */
export async function requireUser(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (session) return session;
  const h = await headers();
  const next = safeRedirectPath(h.get("x-url-path"), "");
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

/** Resolves a session from a Request (route handlers; usable outside the Next request scope). */
export async function getSessionFromRequest(request: Request): Promise<ValidatedSession | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    return validateSessionToken(value);
  }
  return null;
}
