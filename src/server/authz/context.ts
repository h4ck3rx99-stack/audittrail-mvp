import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { NotFoundError, UnauthenticatedError } from "@/server/errors";
import type { OrgContext, SessionUser, UserContext } from "@/server/context";
import type { RequestMeta } from "@/server/request-meta";
import { getRequestMeta } from "@/server/request-meta";
import { getCurrentSession, requireUser } from "@/server/auth/current";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

/**
 * Loads the organization and the user's membership. Returns null when the org does not exist OR
 * the user is not a member, so callers cannot distinguish the two (no org enumeration).
 * Pure database logic (no Next.js APIs) so route handlers and tests can use it directly.
 */
export async function loadOrgContext(
  user: SessionUser,
  orgSlug: string,
  request: RequestMeta,
  sessionId: string | null,
): Promise<OrgContext | null> {
  if (typeof orgSlug !== "string" || !SLUG_RE.test(orgSlug)) return null;
  const membership = await db.organizationMember.findFirst({
    where: { userId: user.id, organization: { slug: orgSlug } },
    select: {
      id: true,
      role: true,
      title: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          requireIndependentEvidenceReview: true,
          defaultEvidenceValidityDays: true,
          isDemo: true,
        },
      },
    },
  });
  if (!membership) return null;
  return {
    user,
    org: membership.organization,
    membership: { id: membership.id, role: membership.role, title: membership.title },
    role: membership.role,
    request,
    sessionId,
  };
}

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
