# Adding a framework

The core is framework-agnostic. A framework is a content module plus one line in the registry; no service, page or schema changes are needed.

## 1. Write the content module

Create `src/server/frameworks/<key>/index.ts` exporting a `FrameworkDefinition` (`src/server/frameworks/types.ts`):

```ts
export const ISO27001: FrameworkDefinition = {
  key: "iso27001",
  name: "ISO/IEC 27001:2022",
  shortName: "ISO 27001",
  version: "2022",
  description: "Information security management system requirements and Annex A controls.",
  requirementLabel: "Annex A controls",
  requirementShortLabel: "Controls",
  requirements: [
    {
      code: "ANNEX_A",
      parentCode: null,
      title: "Annex A",
      summary: "…",
      kind: "GROUP",
      isScopeRequired: true,
    },
    {
      code: "A.5",
      parentCode: "ANNEX_A",
      title: "Organizational controls",
      summary: "…",
      kind: "GROUP",
    },
    {
      code: "A.5.15",
      parentCode: "A.5",
      title: "Access control",
      summary: "…",
      kind: "REQUIREMENT",
    },
  ],
  controlTemplates: [/* optional starter controls */],
};
```

Rules:

- Requirements form a tree: top-level GROUPs are scope categories, intermediate GROUPs are series, and leaves are `REQUIREMENT`s. List parents before their children.
- Write original summaries. Do not copy copyrighted standard text.
- Each control template maps only to `REQUIREMENT` codes of its own framework and has 1–3 evidence requirement templates, each with a stable `key`.

Then add the module to `FRAMEWORK_DEFINITIONS` in `src/server/frameworks/registry.ts`.

## 2. Sync the catalog

```bash
npm run catalog:sync
```

The sync validates the definition and upserts it by `(frameworkId, code)`. It is idempotent and runs on every deploy. Content removed from code is not deleted, because organizations may reference it.

## 3. Adopt and map

- Owners and Admins adopt the framework in **Settings → Frameworks & scope**, choosing categories and optionally the starter controls.
- Existing controls can be mapped to the new framework's requirements from the control's **Requirements** tab. One control can satisfy SOC 2 CC6.1 and ISO 27001 A.5.15 at the same time; readiness is computed per framework from the same evidence.

The same steps apply to HIPAA, GDPR or PCI DSS content modules.
