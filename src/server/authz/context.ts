import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { NotFoundError, UnauthenticatedError } from "@/server/errors";
import type { OrgContext, UserContext } from "@/server/context";
import { loadOrgContext } from "./load-context";

export { loadOrgContext };
import { getRequestMeta } from "@/server/request-meta";
import { getCurrentSession, requireUser } from "@/server/auth/current";

/**
 * For Server Components and layouts: resolves the session (redirecting to login when missing),
 * then the org and membership (404 when either is missing). Memoized per request.
 */
export const requireOrgContext = cache(async (orgSlug: string): Promise<OrgContext> => {
  const { user, sessionId } = await requireUser();
  const ctx = await loadOrgContext(user, orgSlug, await getRequestMeta(), sessionId);
  if (!ctx) notFound();
  return ctx;
});

/** For Server Actions: same resolution, but throws domain errors that map to action results. */
export async function resolveOrgContextForAction(orgSlug: unknown): Promise<OrgContext> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  if (typeof orgSlug !== "string") throw new NotFoundError();
  const ctx = await loadOrgContext(session.user, orgSlug, await getRequestMeta(), session.sessionId);
  if (!ctx) throw new NotFoundError();
  return ctx;
}

/** For Server Components outside an org (account pages, onboarding). */
export const requireUserContext = cache(async (): Promise<UserContext> => {
  const { user, sessionId } = await requireUser();
  return { user, sessionId, request: await getRequestMeta() };
});

/** For Server Actions outside an org. */
export async function resolveUserContextForAction(): Promise<UserContext> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  return { user: session.user, sessionId: session.sessionId, request: await getRequestMeta() };
}
