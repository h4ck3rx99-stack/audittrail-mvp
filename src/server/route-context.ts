import "server-only";
import { getSessionFromRequest } from "@/server/auth/current";
import { loadOrgContext } from "@/server/authz/context";
import { NotFoundError, UnauthenticatedError } from "@/server/errors";
import { requestMetaFromHeaders } from "@/server/request-meta";
import type { OrgContext } from "@/server/context";

/**
 * Org context for route handlers, derived only from the Request (cookie + headers), so handlers
 * also work outside the Next.js request scope (integration tests).
 */
export async function orgContextFromRequest(request: Request, orgSlug: string): Promise<OrgContext> {
  const session = await getSessionFromRequest(request);
  if (!session) throw new UnauthenticatedError();
  const ctx = await loadOrgContext(session.user, orgSlug, requestMetaFromHeaders(request.headers), session.sessionId);
  if (!ctx) throw new NotFoundError();
  return ctx;
}
