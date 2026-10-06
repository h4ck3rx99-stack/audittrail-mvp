import "server-only";
import { db } from "@/server/db";
import type { OrgContext } from "@/server/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseItemKey, riskKey, taskKey } from "@/lib/utils";

export const SEARCH_MIN_LENGTH = 2;

/** Escapes LIKE/ILIKE wildcards so user input always matches literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type SearchResultGroup = "controls" | "requirements" | "evidence" | "tasks" | "risks" | "members";

export type SearchHit = { id: string; group: SearchResultGroup; title: string; subtitle: string | null; href: string };

export type SearchResults = Record<SearchResultGroup, SearchHit[]>;

const EMPTY: SearchResults = { controls: [], requirements: [], evidence: [], tasks: [], risks: [], members: [] };

/**
 * Organization-scoped search over controls, framework requirements of adopted frameworks,
 * evidence, tasks, risks and members. Parameterized SQL only; trigram indexes back the ILIKEs.
 */
export async function searchOrganization(ctx: OrgContext, rawQuery: string, options: { perGroup?: number } = {}): Promise<SearchResults> {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < SEARCH_MIN_LENGTH) return EMPTY;
  await enforceRateLimit("searchPerUser", ctx.user.id, "Too many searches. Wait a moment and try again.");

  const limit = Math.min(Math.max(options.perGroup ?? 5, 1), 50);
  const pattern = `%${escapeLike(query)}%`;
  const orgId = ctx.org.id;
  const base = `/org/${ctx.org.slug}`;
  const taskNumber = parseItemKey(query, "TSK");
  const riskNumber = parseItemKey(query, "RSK");

  const [controls, requirements, evidence, tasks, risks, members] = await Promise.all([
    db.$queryRaw<{ id: string; code: string; name: string }[]>`
      SELECT id, code, name FROM "Control"
      WHERE "organizationId" = ${orgId} AND "archivedAt" IS NULL
        AND (code ILIKE ${pattern} ESCAPE '\\' OR name ILIKE ${pattern} ESCAPE '\\' OR description ILIKE ${pattern} ESCAPE '\\')
      ORDER BY (code ILIKE ${pattern} ESCAPE '\\') DESC, code ASC
      LIMIT ${limit}`,
    db.$queryRaw<{ id: string; code: string; title: string; key: string }[]>`
      SELECT r.id, r.code, r.title, f.key FROM "FrameworkRequirement" r
      JOIN "Framework" f ON f.id = r."frameworkId"
      JOIN "OrganizationFramework" ofw ON ofw."frameworkId" = f.id AND ofw."organizationId" = ${orgId}
      WHERE r.code ILIKE ${pattern} ESCAPE '\\' OR r.title ILIKE ${pattern} ESCAPE '\\'
      ORDER BY r."sortOrder" ASC
      LIMIT ${limit}`,
    db.$queryRaw<{ id: string; title: string; category: string }[]>`
      SELECT e.id, e.title, e.category::text AS category FROM "Evidence" e
      WHERE e."organizationId" = ${orgId} AND e."deletedAt" IS NULL
        AND (e.title ILIKE ${pattern} ESCAPE '\\' OR e.description ILIKE ${pattern} ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM "EvidenceVersion" v WHERE v."evidenceId" = e.id AND v."organizationId" = ${orgId}
                     AND v."originalFilename" ILIKE ${pattern} ESCAPE '\\'))
      ORDER BY e."updatedAt" DESC
      LIMIT ${limit}`,
    db.$queryRaw<{ id: string; number: number; title: string; status: string }[]>`
      SELECT id, number, title, status::text AS status FROM "Task"
      WHERE "organizationId" = ${orgId} AND (title ILIKE ${pattern} ESCAPE '\\' OR number = ${taskNumber ?? -1})
      ORDER BY (number = ${taskNumber ?? -1}) DESC, "updatedAt" DESC
      LIMIT ${limit}`,
    db.$queryRaw<{ id: string; number: number; title: string; status: string }[]>`
      SELECT id, number, title, status::text AS status FROM "Risk"
      WHERE "organizationId" = ${orgId} AND "archivedAt" IS NULL AND (title ILIKE ${pattern} ESCAPE '\\' OR number = ${riskNumber ?? -1})
      ORDER BY (number = ${riskNumber ?? -1}) DESC, "updatedAt" DESC
      LIMIT ${limit}`,
    db.$queryRaw<{ id: string; name: string; email: string; role: string }[]>`
      SELECT u.id, u.name, u.email, m.role::text AS role FROM "OrganizationMember" m
      JOIN "User" u ON u.id = m."userId"
      WHERE m."organizationId" = ${orgId} AND (u.name ILIKE ${pattern} ESCAPE '\\' OR u.email ILIKE ${pattern} ESCAPE '\\')
      ORDER BY u.name ASC
      LIMIT ${limit}`,
  ]);

  return {
    controls: controls.map((c) => ({ id: c.id, group: "controls", title: `${c.code} · ${c.name}`, subtitle: null, href: `${base}/controls/${c.id}` })),
    requirements: requirements.map((r) => ({
      id: r.id,
      group: "requirements",
      title: `${r.code} · ${r.title}`,
      subtitle: null,
      href: `${base}/frameworks/${r.key}?focus=${encodeURIComponent(r.code)}`,
    })),
    evidence: evidence.map((e) => ({ id: e.id, group: "evidence", title: e.title, subtitle: e.category.toLowerCase(), href: `${base}/evidence/${e.id}` })),
    tasks: tasks.map((t) => ({ id: t.id, group: "tasks", title: `${taskKey(Number(t.number))} · ${t.title}`, subtitle: null, href: `${base}/tasks/${t.id}` })),
    risks: risks.map((r) => ({ id: r.id, group: "risks", title: `${riskKey(Number(r.number))} · ${r.title}`, subtitle: null, href: `${base}/risks/${r.id}` })),
    members: members.map((m) => ({ id: m.id, group: "members", title: m.name, subtitle: m.email, href: `${base}/settings/members` })),
  };
}
