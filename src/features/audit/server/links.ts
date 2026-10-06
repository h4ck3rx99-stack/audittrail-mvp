import "server-only";
import { db } from "@/server/db";
import type { OrgContext } from "@/server/context";

type Ref = { resourceType: string; resourceId: string | null };

/**
 * Resolves audit event resources to links, only for resources that still exist in this
 * organization (deleted tasks, removed members, etc. render as plain text).
 */
export async function resolveResourceLinks(ctx: OrgContext, events: readonly Ref[]): Promise<Map<string, string>> {
  const ids = (type: string) => [...new Set(events.filter((e) => e.resourceType === type && e.resourceId).map((e) => e.resourceId!))];
  const base = `/org/${ctx.org.slug}`;
  const [controls, evidence, tasks, risks, reqs] = await Promise.all([
    ids("control").length ? db.control.findMany({ where: { organizationId: ctx.org.id, id: { in: ids("control") } }, select: { id: true } }) : [],
    ids("evidence").length ? db.evidence.findMany({ where: { organizationId: ctx.org.id, id: { in: ids("evidence") }, deletedAt: null }, select: { id: true } }) : [],
    ids("task").length ? db.task.findMany({ where: { organizationId: ctx.org.id, id: { in: ids("task") } }, select: { id: true } }) : [],
    ids("risk").length ? db.risk.findMany({ where: { organizationId: ctx.org.id, id: { in: ids("risk") } }, select: { id: true } }) : [],
    ids("evidence_requirement").length
      ? db.evidenceRequirement.findMany({ where: { organizationId: ctx.org.id, id: { in: ids("evidence_requirement") } }, select: { id: true, controlId: true } })
      : [],
  ]);
  const links = new Map<string, string>();
  for (const c of controls) links.set(`control:${c.id}`, `${base}/controls/${c.id}`);
  for (const e of evidence) links.set(`evidence:${e.id}`, `${base}/evidence/${e.id}`);
  for (const t of tasks) links.set(`task:${t.id}`, `${base}/tasks/${t.id}`);
  for (const r of risks) links.set(`risk:${r.id}`, `${base}/risks/${r.id}`);
  for (const r of reqs) links.set(`evidence_requirement:${r.id}`, `${base}/controls/${r.controlId}?tab=evidence`);
  for (const e of events) {
    if (e.resourceType === "framework") links.set(`framework:${e.resourceId}`, `${base}/frameworks`);
    if (e.resourceType === "member" || e.resourceType === "invitation") links.set(`${e.resourceType}:${e.resourceId}`, `${base}/settings/members`);
    if (e.resourceType === "organization") links.set(`organization:${e.resourceId}`, `${base}/settings`);
  }
  return links;
}
