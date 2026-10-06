import "server-only";
import { secureCookies } from "@/env";

/** The __Host- prefix (https only) pins the cookie to this exact origin and path "/". */
export const SESSION_COOKIE = secureCookies ? "__Host-audittrail_session" : "audittrail_session";
export const LAST_ORG_COOKIE = "audittrail_last_org";

/** Absolute session lifetime; the idle (sliding) lifetime is enforced in the database. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/** The idle expiry is refreshed at most once a day. */
export const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_ABSOLUTE_LIFETIME_MS / 1000,
};

export const lastOrgCookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 180 * 24 * 60 * 60,
};
