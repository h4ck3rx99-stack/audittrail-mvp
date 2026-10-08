# Security

## Threat model

| Threat | Mitigation |
|---|---|
| A member of organization A reads or changes organization B's data | Every query is scoped by `organizationId` from a server-resolved context. Cross-references are verified, join tables have composite foreign keys, and foreign resources return 404. Integration tests cover every resource type and every file endpoint. |
| Privilege escalation inside an organization | One permission module checked on the server for every write. Roles come only from the membership row. Admins cannot grant Owner or Admin, and the last Owner is protected (row locks prevent races). |
| Session theft or fixation | Opaque 256-bit tokens, stored only as HMAC-SHA256. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` with the `__Host-` prefix on https. Every login creates a new session; sessions are revocable, expire after 7 idle days and have a 30-day absolute lifetime. |
| Credential stuffing and brute force | Database-backed rate limits: 5/min per IP+email, 20/min per IP and 10/min per account. Errors are generic, failed logins for known accounts are audited, and timing is equalized for unknown accounts. |
| Malicious uploads (XSS, polyglots, oversized files) | Extension allowlist, magic-byte detection, declared-type agreement, UTF-8 checks for text, and rejection of HTML/SVG markup, executables and archives. Size is capped while streaming, filenames are display-only and storage keys are server-generated. Downloads are attachments sent with `nosniff`, `Content-Security-Policy: sandbox` and `no-store`. |
| XSS through user text | No `dangerouslySetInnerHTML` (ESLint-enforced). User text renders as text, URLs are restricted to http(s), and link evidence opens with `rel="noopener noreferrer nofollow"`. A CSP with script nonces is set. |
| CSRF | Server Actions get Next.js' built-in Origin check. Mutating route handlers compare `Origin` with `APP_URL`, cookies are `SameSite=Lax`, and there are no state-changing GET requests (downloads and exports only add audit events). |
| Tampering with history | The audit trail is append-only (a database trigger rejects UPDATE and DELETE), events are SHA-256 hash-chained per organization, and verification is available in the UI, through `npm run audit:verify` and in tests. |
| Open redirects | `next` and `returnTo` must be same-origin relative paths (`src/lib/safe-redirect.ts`). |
| Secret leakage | Configuration is validated in `src/env.ts` and only `NEXT_PUBLIC_*` values reach the client. Logs redact passwords, tokens, cookies and authorization headers; audit metadata redacts sensitive keys. Users see generic error messages. |

## Authentication and sessions

Authentication is first-party (see `docs/DECISIONS.md`):

- **Passwords:** scrypt (N=2^15, r=8, p=1), 12–128 characters, with a list of obvious passwords rejected.
- **Password reset:** single-use tokens, stored as HMACs, valid for 30 minutes. The request response is always generic, and a successful reset revokes all sessions.
- **Password change:** requires the current password and revokes all other sessions.
- **Session listing and revocation:** available under Account → Security.
- **Email verification:** `emailVerified` is stored but not enforced in the MVP. Because of that, accepting an invitation requires the single-use invitation token, which proves access to the invited mailbox; matching the signed-in email alone is not enough.

## RBAC and tenant isolation

The permission matrix lives in `src/server/authz/permissions.ts` and is tested row by row for every role (`tests/unit/permissions.test.ts`), including:

- ownership rules for Members (own controls, creator or assignee of tasks, own pending uploads, risk owner),
- the independent review rule (organization setting `requireIndependentEvidenceReview`, on by default; changes to it are audited),
- last-Owner protection and the Admin escalation limits.

Tenant isolation is tested in `tests/integration/tenant-isolation.test.ts` across all services and the upload, download and export route handlers.

**Future defense in depth:** Postgres row-level security keyed on a per-transaction `app.organization_id` setting would add a database-level backstop to application scoping.

## File handling

- **Allowed types:** pdf, png, jpg/jpeg, webp, docx, xlsx, pptx, csv, txt, json, md and log.
- **Validation:** the extension, the declared MIME type and the detected type must agree.
- **Size:** capped by `MAX_UPLOAD_MB`, enforced while streaming.
- **Malware scanning:** `scanFile()` is a no-op hook. Connect ClamAV or a scanning API before production use.
- **Storage:** no public bucket. Downloads go only through the authorized, audited endpoint, and S3 presigned URLs live for at most 60 seconds.
- **Deletion:** a soft delete. The file is retained and its hash is recorded in the audit event.

## Audit trail: guarantees and limits

**Guarantees:**

- Every mutation writes its event in the same transaction as the change.
- Events are append-only at the database level.
- Each chain is hash-linked, and verification detects modified events, removed events (including removal of the newest event, through the chain head) and broken links.

**Limits (stated honestly):** the chain makes tampering *detectable*, not impossible. Someone with database superuser access could rewrite an entire chain together with its head. TRUNCATE is deliberately not blocked by the trigger: row triggers do not fire for TRUNCATE, and the test suite relies on it. In production, remove that capability with database privileges.

## Content Security Policy

`src/proxy.ts` sets a per-request nonce:

- `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`
- `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `frame-src 'none'`

**Tradeoff:** `style-src` allows `'unsafe-inline'`. React renders computed `style` attributes (progress bars) and Radix positions popovers with inline styles. Scripts remain nonce-only, which is where the XSS risk lies.

Other headers, from `next.config.ts`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS on https in production.

## Client IPs

`TRUST_PROXY` is the number of trusted reverse-proxy hops. At 0 (the default), `X-Forwarded-For` is ignored: IPs are recorded as unknown, and per-IP limits share one bucket while per-account limits still apply. Set it to match your load balancer setup in production.

## Production hardening checklist

- [ ] Run the app with a database role that has only INSERT and SELECT on `AuditEvent` and `AuditChainHead` (via a SECURITY DEFINER function for the head update) and does not own the tables. That role then cannot TRUNCATE or disable triggers.
- [ ] Periodically anchor chain-head hashes (`AuditChainHead.lastHash`) to WORM storage, for example S3 Object Lock, so a full-chain rewrite is detectable from outside the database.
- [ ] Define audit-log and evidence retention policies.
- [ ] Enable Postgres row-level security as defense in depth.
- [ ] Connect `scanFile()` to a malware scanner.
- [ ] Enforce email verification before accepting invitations by email match.
- [ ] Add SSO/SAML and MFA for AuditTrail accounts.
- [ ] Set `DEPLOYMENT_ENV=production`, an https `APP_URL`, `STORAGE_DRIVER=s3`, a real email driver, strong `AUTH_SECRET` and `CRON_SECRET` values, and `TRUST_PROXY` to match your load balancers.
- [ ] Run `npm audit --omit=dev` on every release.
