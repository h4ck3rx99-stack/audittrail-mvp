import "server-only";
import { db } from "@/server/db";
import { FRAMEWORK_DEFINITIONS } from "./registry";
import { CONTROL_DOMAINS, type FrameworkDefinition } from "./types";

export type CatalogSyncSummary = {
  framework: string;
  requirements: number;
  controlTemplates: number;
  evidenceTemplates: number;
};

const DOMAIN_ORDER = Object.keys(CONTROL_DOMAINS);

function templateSortKey(code: string): [number, string] {
  const prefix = code.split("-")[0] ?? "";
  const idx = DOMAIN_ORDER.indexOf(prefix);
  return [idx === -1 ? DOMAIN_ORDER.length : idx, code];
}

/** Validates a content module before touching the database. Throws on any inconsistency. */
export function validateFrameworkDefinition(def: FrameworkDefinition): void {
  const codes = new Set<string>();
  for (const r of def.requirements) {
    if (codes.has(r.code)) throw new Error(`${def.key}: duplicate requirement code ${r.code}`);
    if (r.parentCode && !codes.has(r.parentCode)) {
      throw new Error(`${def.key}: requirement ${r.code} references parent ${r.parentCode} before it is defined`);
    }
    codes.add(r.code);
  }
  const requirementKinds = new Map(def.requirements.map((r) => [r.code, r.kind]));
  const templateCodes = new Set<string>();
  for (const t of def.controlTemplates) {
    if (templateCodes.has(t.code)) throw new Error(`${def.key}: duplicate control template ${t.code}`);
    templateCodes.add(t.code);
    if (t.requirementCodes.length === 0) throw new Error(`${def.key}: template ${t.code} maps no requirements`);
    for (const code of t.requirementCodes) {
      if (requirementKinds.get(code) !== "REQUIREMENT") {
        throw new Error(`${def.key}: template ${t.code} maps unknown requirement ${code}`);
      }
    }
    if (t.evidence.length < 1 || t.evidence.length > 3) {
      throw new Error(`${def.key}: template ${t.code} must define 1–3 evidence requirements`);
    }
    const keys = new Set<string>();
    for (const e of t.evidence) {
      if (keys.has(e.key)) throw new Error(`${def.key}: template ${t.code} has duplicate evidence key ${e.key}`);
      keys.add(e.key);
    }
  }
}

/**
 * Idempotently upserts one framework's catalog by (frameworkId, code). Safe to run on every
 * deploy. Content removed from code is not deleted, because organizations may reference it.
 */
export async function syncFramework(def: FrameworkDefinition): Promise<CatalogSyncSummary> {
  validateFrameworkDefinition(def);

  return db.$transaction(
    async (tx) => {
      const framework = await tx.framework.upsert({
        where: { key: def.key },
        create: {
          key: def.key,
          name: def.name,
          shortName: def.shortName,
          version: def.version,
          description: def.description,
          requirementLabel: def.requirementLabel,
          requirementShortLabel: def.requirementShortLabel,
          isActive: true,
        },
        update: {
          name: def.name,
          shortName: def.shortName,
          version: def.version,
          description: def.description,
          requirementLabel: def.requirementLabel,
          requirementShortLabel: def.requirementShortLabel,
          isActive: true,
        },
      });

      const idByCode = new Map<string, string>();
      for (const [index, r] of def.requirements.entries()) {
        const parentId = r.parentCode ? idByCode.get(r.parentCode) ?? null : null;
        const data = {
          parentId,
          title: r.title,
          summary: r.summary,
          kind: r.kind,
          isScopeRequired: r.isScopeRequired ?? false,
          sortOrder: index,
        };
        const row = await tx.frameworkRequirement.upsert({
          where: { frameworkId_code: { frameworkId: framework.id, code: r.code } },
          create: { frameworkId: framework.id, code: r.code, ...data },
          update: data,
          select: { id: true },
        });
        idByCode.set(r.code, row.id);
      }

      const sorted = [...def.controlTemplates].sort((a, b) => {
        const [ai, ac] = templateSortKey(a.code);
        const [bi, bc] = templateSortKey(b.code);
        return ai - bi || ac.localeCompare(bc);
      });

      let evidenceTemplates = 0;
      for (const [index, t] of sorted.entries()) {
        const data = {
          name: t.name,
          description: t.description,
          guidance: t.guidance,
          domain: t.domain,
          defaultPriority: t.priority,
          defaultReviewFrequency: t.reviewFrequency,
          sortOrder: index,
        };
        const template = await tx.controlTemplate.upsert({
          where: { frameworkId_code: { frameworkId: framework.id, code: t.code } },
          create: { frameworkId: framework.id, code: t.code, ...data },
          update: data,
          select: { id: true },
        });

        await tx.controlTemplateRequirement.deleteMany({ where: { controlTemplateId: template.id } });
        await tx.controlTemplateRequirement.createMany({
          data: t.requirementCodes.map((code) => ({
            controlTemplateId: template.id,
            requirementId: idByCode.get(code)!,
          })),
        });

        for (const [eIndex, e] of t.evidence.entries()) {
          const eData = {
            title: e.title,
            description: e.description,
            freshnessDays: e.freshnessDays,
            isRequired: e.isRequired ?? true,
            sortOrder: eIndex,
          };
          await tx.evidenceRequirementTemplate.upsert({
            where: { controlTemplateId_key: { controlTemplateId: template.id, key: e.key } },
            create: { controlTemplateId: template.id, key: e.key, ...eData },
            update: eData,
          });
          evidenceTemplates += 1;
        }
      }

      return {
        framework: def.key,
        requirements: def.requirements.length,
        controlTemplates: def.controlTemplates.length,
        evidenceTemplates,
      };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

export async function syncCatalog(): Promise<CatalogSyncSummary[]> {
  const results: CatalogSyncSummary[] = [];
  for (const def of FRAMEWORK_DEFINITIONS) results.push(await syncFramework(def));
  return results;
}
