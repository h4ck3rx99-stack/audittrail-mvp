import type { Role } from "@/generated/prisma/enums";
import type { RequestMeta } from "@/server/request-meta";

/** The authenticated user, as resolved from the session on the server. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type OrgInfo = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  requireIndependentEvidenceReview: boolean;
  defaultEvidenceValidityDays: number;
  isDemo: boolean;
};

/**
 * The authorized context every tenant service receives as its first argument.
 * It is only ever constructed on the server from the session and the membership row in the
 * database (never from client input). See src/server/authz/context.ts.
 */
export type OrgContext = {
  user: SessionUser;
  org: OrgInfo;
  membership: { id: string; role: Role; title: string | null };
  role: Role;
  request: RequestMeta;
  sessionId: string | null;
  /** Extra metadata merged into every audit event written with this context (e.g. { seed: true }). */
  auditMetadata?: Record<string, unknown>;
};

/** Context for account-level operations that are not tied to an organization. */
export type UserContext = {
  user: SessionUser;
  request: RequestMeta;
  sessionId: string | null;
  auditMetadata?: Record<string, unknown>;
};
