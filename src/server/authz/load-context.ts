import "server-only";
import { db } from "@/server/db";
import type { OrgContext, SessionUser } from "@/server/context";
import type { RequestMeta } from "@/server/request-meta";

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
