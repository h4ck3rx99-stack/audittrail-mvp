# AuditTrail

AuditTrail is a continuous SOC 2 audit-readiness platform. It replaces spreadsheets, scattered documents and evidence chasing with one system of record. That record shows what the audit requires, what is done, what is proven, what is missing, who owns it, and what changed.

A SOC 2 report is an attestation issued by an independent CPA firm. AuditTrail helps you prepare for one; it does not certify anything. Its readiness score is an internal estimate, not an audit opinion.

## The core loop

| Stage | In AuditTrail |
|---|---|
| Framework | SOC 2 Trust Services Criteria as a requirement tree, scoped by category |
| Controls | Owned safeguards mapped to criteria; a 55-control starter library |
| Evidence | Files and links matched to explicit evidence requirements, with versions, review and freshness |
| Reviews | Independent approval or rejection of evidence; periodic control reviews |
| Gaps | Detected live: missing, expired or rejected evidence, unowned controls, overdue reviews, uncovered criteria, overdue tasks and risks |
| Tasks | Assigned, dated work, created directly from gaps |
| Resolution | Tasks completed; risks mitigated or accepted with notes |
| Audit trail | Every change recorded in the same transaction, hash-chained and verifiable |

## Features

- **Workspaces:** multiple organizations per user, with an org switcher.
- **Roles:** Owner, Admin, Member and Viewer, enforced on the server (see the matrix in `docs/SECURITY.md`).
- **Onboarding wizard:** organization details, framework scope, audit plan and starter controls.
- **Dashboard:** readiness and evidence coverage with visible definitions, category and series breakdowns, "Needs attention", "My work", recent activity and a getting-started checklist.
- **Controls:** filterable, sortable table with URL state, bulk owner and status changes, a detail page (overview, evidence, requirements, reviews, tasks and risks, activity) and optimistic concurrency.
- **Evidence:** a library with *Needs review*, *Missing* and *Expiring* tabs; streaming upload with type checks; versioning; reuse across controls; independent review; audited downloads.
- **Risks & gaps:** detected gaps with *Create task* and *Track as risk*, plus a risk register with resolution workflow.
- **Audit log:** filters, a diff drawer, CSV export and integrity verification.
- **Everything else:** ⌘K / Ctrl+K command palette and search; in-app and email notifications with a scheduled compliance scan; account security (password, sessions, sign-in history); light and dark themes.

## Tech stack

Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript (strict), PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`), Tailwind CSS 4 with Radix primitives, zod, Vitest and Playwright. Authentication is first-party (database sessions, scrypt). See `docs/DECISIONS.md` for why.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- Docker (for Postgres), or any PostgreSQL 16+ server

## Quick start

```bash
git clone <repo> audittrail && cd audittrail
npm install
npm run env:init            # creates .env from .env.example with generated secrets
docker compose up -d        # Postgres on localhost:5433 (+ audittrail_test database)
npm run db:deploy           # apply migrations
npm run db:seed             # catalog sync + demo data
npm run dev                 # http://localhost:3000
```

`.npmrc` points npm at `registry.yarnpkg.com`, which serves the same packages as npmjs.org. That mirror was needed on the original build network; delete the line to use the default registry.

## Demo accounts (development only)

All demo accounts use the password `northwind-demo-2026`. **Never seed demo data into production.**

| Email | Persona | Role |
|---|---|---|
| olivia@northwind.example | Founder & CEO | Owner, Northwind Labs |
| marcus@northwind.example | Security Lead | Admin, Northwind Labs **and** Contoso Health |
| priya@northwind.example | Engineering Lead | Member |
| sam@northwind.example | People Operations | Member |
| dana@auditor.example | External Auditor | Viewer |
| elena@contoso.example | Founder | Owner, Contoso Health |

Both demo organizations are labeled as demo workspaces throughout the UI.

## Environment variables

Every variable is documented in `.env.example` and validated at startup by `src/env.ts`. The key ones:

| Variable | Purpose |
|---|---|
| `DEPLOYMENT_ENV` | `local` or `production`. Production rejects the local storage driver, console email and non-https `APP_URL`, and requires `CRON_SECRET` |
| `DATABASE_URL`, `DATABASE_URL_TEST` | App and test databases (the test database is truncated between tests) |
| `AUTH_SECRET` | HMAC key for session, reset and invitation tokens (≥32 characters) |
| `APP_URL` | Public origin; used for email links and Origin checks |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_*`, `MAX_UPLOAD_MB` | Evidence storage |
| `EMAIL_DRIVER`, `EMAIL_FROM`, `SMTP_*`, `RESEND_API_KEY` | Email delivery |
| `CRON_SECRET` | Bearer token for `POST /api/cron/compliance-scan` |
| `TRUST_PROXY` | Number of trusted proxy hops for client IPs (0 = ignore `X-Forwarded-For`) |
| `LOG_LEVEL`, `ALLOW_DEMO_SEED` | Logging level; allows seeding when `DEPLOYMENT_ENV=production` |

## Database, migrations and catalog sync

- `npm run db:migrate`: create or apply migrations in development.
- `npm run db:deploy`: apply committed migrations (CI and production).
- `npm run catalog:sync`: idempotently sync framework content from `src/server/frameworks/` into the database. Run it on every deploy.
- `npm run db:studio`: Prisma Studio.

Raw-SQL migrations add the append-only trigger on `AuditEvent`, partial unique indexes that prevent duplicate evidence links, and CHECK constraints. Trigram search indexes are declared in `schema.prisma`.

## Seeding

`npm run db:seed` runs the catalog sync, then creates the demo organizations through the real service layer. Every audit event it writes is genuine and tagged `metadata.seed = true`; no history is backdated. Only domain dates (due dates, validity) are relative to seed time. The seed skips itself if demo data already exists.

`npm run db:reset` drops the database, re-applies migrations and seeds. It destroys all data, so use it only on development databases.

## Testing

```bash
npm test                 # Vitest unit + integration tests against DATABASE_URL_TEST
npm run test:e2e         # Playwright: builds the app, serves it on :3100 against a seeded audittrail_e2e database
npx playwright install chromium   # once, before the first E2E run
```

The suites cover:

- the permission matrix for every role,
- tenant isolation across all services and file endpoints,
- authentication,
- controls, evidence, tasks, risks and members,
- the audit trail (transactionality, redaction, concurrency, the trigger, tamper detection),
- the readiness and gap engines,
- notifications and the compliance scan,
- search and catalog coverage.

## Scheduled jobs

The compliance scan sends notifications for tasks due soon or overdue, evidence expiring or expired, and control reviews coming due. It is idempotent.

- **CLI:** `npm run jobs:scan`
- **HTTP:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/compliance-scan`
- **Vercel:** Vercel Cron issues GET requests, but this endpoint accepts POST only, because state-changing GETs are not allowed. On Vercel, trigger it from an external scheduler instead, for example a GitHub Actions `schedule` workflow that runs the `curl` command above with `CRON_SECRET` stored as a repository secret.
- **System cron:** `0 6 * * * cd /srv/audittrail && npm run jobs:scan`

`npm run audit:verify` verifies every audit hash chain and exits non-zero if any chain is broken. Schedule it too.

## Deployment

1. **Database:** managed PostgreSQL 16+. Set `DATABASE_URL`.
2. **Storage:** an S3 or R2 bucket with public access blocked. Set `STORAGE_DRIVER=s3` and `S3_*` (use `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` for R2 or MinIO).
3. **Email:** `EMAIL_DRIVER=smtp` or `resend`.
4. **Configuration:** `DEPLOYMENT_ENV=production`, an https `APP_URL`, strong `AUTH_SECRET` and `CRON_SECRET`, and `TRUST_PROXY` set for your load balancer.
5. **On every release,** run `npm run db:deploy` and `npm run catalog:sync` before switching traffic.
6. **Hosting:**
   - **Vercel:** works with the default build (`npm run build`).
   - **Container:** `docker build -t audittrail .` builds a standalone image; the release commands are documented in the `Dockerfile` header.
7. **Scheduling:** schedule the compliance scan and `audit:verify`.
8. **Hardening:** work through the production checklist in `docs/SECURITY.md`.

## Project structure

```
src/
  app/                 routes: public, auth, onboarding, /org/[orgSlug]/..., /account, /api/...
  components/ui/       primitives (button, form controls, dialogs, menus, tooltips)
  components/app/      shell, tables, status badges, filters, activity feed, command palette
  features/<feature>/  schemas.ts, actions.ts (Server Actions), server/ (services, queries), components/
  server/              env-validated infrastructure: db, auth, authz, audit, storage, email, rate limits, jobs, frameworks
  lib/                 client-safe utilities (dates, zod helpers, redirects)
prisma/                schema, migrations, seed
tests/                 unit/, integration/, e2e/, helpers/
docs/                  ARCHITECTURE, SECURITY, FRAMEWORKS, DECISIONS, BUILD_LOG
```

## Known limitations

- Email verification is stored but not enforced. As a result, accepting an invitation requires the invitation link (token).
- Malware scanning is a no-op hook (`scanFile`).
- PDF previews are download-only. Images preview inline.
- The controls list loads an organization's controls into memory to compute health. This is fine for hundreds of controls; very large catalogs would need SQL-side aggregation.
- "Evidence pending review for more than 7 days" depends on real elapsed time, so freshly seeded data does not show it.
- Out of scope for the MVP: integrations, SSO/SAML, organization deletion, billing, a policy editor and an auditor portal (the Viewer role covers read-only access).

## Security notes

- Every read and write is authorized on the server through one permission module.
- Tenant data is isolated by query scoping plus composite foreign keys.
- The audit trail is append-only and hash-chained. That makes tampering detectable, not impossible: a database superuser could rewrite a chain. See `docs/SECURITY.md` for the threat model and the production hardening checklist.
