# Build log

## Current status

Step 17 in progress (test suites). Resume from "Next steps" below.

## Completed

- Steps 0–5: toolchain, foundation, schema and migrations, auth core, permissions (208 tests), audit chain (10 tests).
- Steps 6–15 (services): frameworks/adoption, controls, evidence (upload, versions, review, links, download), tasks, risks, readiness and gap engines, members/invitations, notifications and compliance scan, search, audit log (list, export, verify). Integration tests: controls (14), evidence (25).
- All pages and route handlers: landing, auth, onboarding, org picker, dashboard, frameworks, controls, evidence, tasks, risks and gaps, audit log, search, notifications, settings, account, invite; API upload/download/export/cron/health.
- Lint and typecheck clean as of the last commit. Dev server verified manually: sign-up, onboarding, dashboard, controls list and detail.
- CLI scripts: catalog:sync, audit:verify, jobs:scan.
- Demo seed runs cleanly via `npm run db:seed` (Northwind Labs: 55 controls, 41 evidence, 19 tasks, 8 risks; Contoso Health; 10 audit chains verify). `db:reset` itself needs explicit user consent (Prisma blocks AI-run resets).
- Tests: 288 passing (permissions, audit chain, controls, evidence, auth, readiness, gaps).

## Next steps

1. Remaining test suites (Section 14): tenant isolation (services + route handlers), tasks/risks, notifications, search, catalog coverage, audit events per service.
3. Playwright E2E (happy path and RBAC) plus playwright.config.ts.
4. Security pass (Section 12), UX pass (Section 11).
5. Docs: README, ARCHITECTURE, SECURITY, FRAMEWORKS, DECISIONS updates (invitation acceptance requires a token; CSP style-src 'unsafe-inline' tradeoff; PDF previews are download-only). Dockerfile, CI workflow.
6. Verification loop (Section 16), including npm audit (prisma/mysql2 advisory in dev tooling).

## Open issues

- npm audit reports advisories via the prisma CLI (mysql2, deepmerge-ts); not yet triaged.
