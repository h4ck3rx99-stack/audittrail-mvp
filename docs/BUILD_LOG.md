# Build log

## Current status

Complete. Verification loop (Section 16) passes; code formatted with Prettier (checked in CI).

## Completed

- Steps 0–5: toolchain, foundation, schema and migrations, auth core, permission module, audit chain.
- Steps 6–15: all services, read models, pages and route handlers (see README feature list).
- Step 16: demo seed runs via `npm run db:seed` (Northwind Labs: 55 controls, 41 evidence items, 19 tasks, 8 risks; Contoso Health; all audit chains verify).
- Step 17: Vitest suites: permissions, audit chain, auth, controls, evidence, tenant isolation (services + upload/download/export routes), tasks/risks/members, notifications/scan/cron, search, readiness, gaps, catalog. Playwright specs: happy path and RBAC.
- Step 20: README, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/FRAMEWORKS.md, docs/DECISIONS.md, Dockerfile, .github/workflows/ci.yml.
- Dependency audit: production dependencies clean after overriding mysql2 and deepmerge-ts (both pulled in by the Prisma CLI).

## Verification (2026-10-08)

| Check                                      | Result                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| `npm run lint`                             | pass (0 warnings)                                             |
| `npm run typecheck`                        | pass                                                          |
| `npm test`                                 | 11 files, 315 tests pass                                      |
| `npm run build`                            | pass                                                          |
| `next start` + `node scripts/smoke.mjs`    | pass (health, /login with CSP nonce, authenticated dashboard) |
| `npm run test:e2e`                         | 2 specs pass (happy path, RBAC)                               |
| `npm audit --omit=dev`                     | 0 vulnerabilities                                             |
| `npm run db:seed` + `npm run audit:verify` | pass (all chains intact)                                      |
| `git status`                               | no secrets, uploads, build output or .env files tracked       |

`npm run db:reset` from zero on the dev database (run with explicit user consent): all 3 migrations applied, seed completed, 8 chains / 350 events verified intact.

## UX pass

Checked in the browser on seeded data: dashboard (light), evidence, gaps and audit log (dark), controls at 768px. No console errors. Criteria chips no longer wrap vertically in narrow tables.

## Open issues

- `braces` (all versions, no fix released) is reachable only through `eslint-config-next` → fast-glob in dev tooling, which processes trusted glob patterns. Accepted as dev-only.
- Prisma blocks AI-initiated `db:reset` without explicit user consent; the seed is idempotent on an existing database.
