# Architecture

AuditTrail is a single Next.js 16 application (App Router, React Server Components, Server Actions) backed by PostgreSQL through Prisma 7.

## Layers

```
UI (server components; client components only for interactivity)
  └─ Entry points: Server Actions (src/features/*/actions.ts) and route handlers (src/app/api/**)
       └─ Services (src/features/*/server/service.ts, src/server/auth/service.ts)
            └─ Prisma (src/server/db.ts)
```

- **Entry points do four things**: parse input (zod), resolve the authenticated context, call a service, and map the result. Server Actions return `{ ok, data } | { ok: false, error }` through `runAction` (`src/server/result.ts`). Route handlers map errors with `errorResponse` (`src/server/http.ts`).
- **Services own the business rules**: validation, authorization (`assertCan`), tenant scoping, audited transactions and notifications. Every service takes the authorized `OrgContext` (or `UserContext`) as its first argument and never accepts an organization ID from the client.
- **Read models** (`src/features/*/server/queries.ts`) assemble page data in a small, fixed number of queries.
- **Pages never import Prisma.** ESLint enforces this for `src/app`, `src/components` and `src/features/*/components`. Every server module starts with `import "server-only"`.
- **The proxy is not a security boundary.** `src/proxy.ts` only sets a CSP nonce, a request ID and `x-url-path`, remembers the last org slug, and optimistically redirects requests that have no session cookie. Every page, action and route handler re-validates the session and membership.

## Tenancy model

There is one database and one shared schema, and every tenant row carries `organizationId`.

- `loadOrgContext` (`src/server/authz/load-context.ts`) resolves `(user, orgSlug)` to `{ user, org, membership, role, request }`. It returns null when the org does not exist or the user is not a member, so the two cases are indistinguishable. `requireOrgContext` wraps it with React `cache()` and `notFound()` for pages; `resolveOrgContextForAction` throws domain errors for actions; `orgContextFromRequest` builds it from a raw `Request` for route handlers.
- Every query on a tenant table filters by `organizationId: ctx.org.id`. Single records are loaded with `findFirst({ where: { id, organizationId } })`, and updates and deletes use `updateMany` or `deleteMany` with the same filter.
- Cross-references (owners, assignees, controls, requirements, risks, evidence) are verified by `src/server/tenancy.ts` helpers. Foreign resources surface as `NotFoundError` (404).
- Join tables use composite foreign keys `(organizationId, id)`, so the database itself rejects cross-tenant rows. A requirement-specific evidence link also has a composite FK `(evidenceRequirementId, controlId)`.
- Roles come only from the `OrganizationMember` row. `src/server/authz/permissions.ts` implements the permission matrix (`check`, `can`, `assertCan`, `denialReason`); the UI receives flags and reasons computed by the same module.

## The audited-transaction pattern

Every mutation runs inside `withAuditedTransaction(ctx, async ({ tx, audit, notify, afterCommit }) => …)` (`src/server/audit/record.ts`):

1. It opens a Prisma interactive transaction.
2. The service writes its data and calls `audit.record({ action, resourceType, resourceId, resourceLabel, changes, metadata })`.
3. `appendAuditEvent` locks the chain head row (`SELECT … FOR UPDATE`), computes `sequence = last + 1` and `hash = SHA-256(canonical JSON)` linked to the previous hash, then inserts the event and advances the head.
4. `notify()` writes in-app notification rows in the same transaction, never to the actor.
5. Email and other side effects registered with `afterCommit` run only after a successful commit.

If anything throws, nothing commits: no data change exists without its event, and no event exists for a change that did not happen. Per-chain locking serializes audited writes within one organization, which is acceptable for the MVP.

Chains are `org:<organizationId>` for workspace activity and `user:<userId>` for authentication events. `verifyAuditChain` (`src/server/audit/verify.ts`) recomputes every hash, checks sequence continuity and `prevHash` links, and compares the last event with the chain head. Activity feeds, the audit log and the dashboard all read `AuditEvent` and render it through `describeEvent()` (`src/server/audit/describe.ts`).

## Readiness engine

`src/features/readiness/engine.ts` and `src/features/gaps/engine.ts` are pure functions over plain data. They are the single source of truth for:

- evidence requirement state (Satisfied, Expiring soon, Pending review, Rejected, Expired, Missing) and freshness,
- control health (Ready, Attention, Not ready),
- readiness % and evidence coverage % (shown as "—" when nothing is applicable),
- requirement coverage (Covered, Partial, Uncovered) and category and series breakdowns,
- detected gaps, each with a stable `gapKey`, a severity and a suggested action.

`loadComplianceSnapshot` (`src/features/readiness/server/snapshot.ts`) loads an organization's frameworks, controls, mappings, evidence requirements and links in two queries, then evaluates everything in memory. The dashboard, controls list, framework tree, evidence "Missing" tab and gaps page all use it. Dates are compared as calendar dates in the organization's timezone.

## Framework catalog

Framework content lives in code (`src/server/frameworks/<framework>/`) as a `FrameworkDefinition`. `npm run catalog:sync` upserts it idempotently by `(frameworkId, code)`. Adoption copies templates into organization-owned controls, mappings and evidence requirements in one audited transaction. The core never branches on a specific framework. See `docs/FRAMEWORKS.md`.

## Storage

`src/server/storage/index.ts` defines `StorageDriver { put, getStream, getSignedDownloadUrl?, delete?, exists }`, with two drivers:

- **Local filesystem** (development): stores files under `STORAGE_LOCAL_DIR`, validates key format and guards against path traversal. It is rejected when `DEPLOYMENT_ENV=production`.
- **S3-compatible** (S3, R2, MinIO): server-side encryption on put; downloads redirect to presigned URLs valid for 60 seconds.

Keys are `org/{orgId}/evidence/{evidenceId}/{versionId}` and are generated by the server only. Uploads stream through `POST /api/org/[slug]/evidence/upload` with a hard size cap. Files are checked by magic bytes against the extension and declared type, hashed (SHA-256), passed to the `scanFile` hook, stored, and then recorded in an audited transaction.

## Email

`src/server/email/index.ts` defines an `EmailProvider` with `console` (development), `smtp` (nodemailer) and `resend` drivers, plus an in-memory driver for tests. Emails are sent after commit, and delivery failures are logged without failing the request.

## Jobs

`runComplianceScan()` (`src/server/jobs/compliance-scan.ts`) finds tasks that are due soon or overdue, evidence that is expiring or expired, and control reviews that are due. It writes notifications deduplicated by `dedupeKey` and prunes stale rate-limit buckets. It runs through `POST /api/cron/compliance-scan` (bearer `CRON_SECRET`) or `npm run jobs:scan`.
