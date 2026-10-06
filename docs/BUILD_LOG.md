# Build log

## Current status

In progress: product features (Step 6 onward).

## Completed

- Step 0: reconnaissance. Empty repository; Node 24, npm through `registry.yarnpkg.com` (see DECISIONS), Docker Postgres 17 on port 5433.
- Step 1: foundation. TypeScript strict, ESLint flat config, Prettier, `src/env.ts`, logger, domain errors, action results, docker-compose, npm scripts.
- Step 2: database. Full Prisma schema, three migrations (extensions, init, raw SQL for the append-only trigger, partial unique indexes and CHECKs), catalog sync script.
- Step 3: authentication core (scrypt, HMAC'd tokens, DB sessions, auth service with rate limits and audit events).
- Step 4: tenancy and authorization core (`loadOrgContext`, `requireOrgContext`, permission module). 208 permission-matrix tests pass.
- Step 5: audit core (hash chain, audited transaction helper, verification). 10 integration tests pass.

## Next steps

- Steps 6–10: controls and adoption, evidence and storage, tasks, risks and gaps, readiness and dashboard.

## Open issues

- None yet.
