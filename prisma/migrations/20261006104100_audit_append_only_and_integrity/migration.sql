-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Append-only audit trail.
--
-- Any UPDATE or DELETE on "AuditEvent" raises an exception. This is enforced per row.
--
-- Deliberately NOT covered: TRUNCATE. Row-level triggers do not fire for TRUNCATE, and the
-- integration test suite relies on TRUNCATE to reset the test database between tests.
-- In production, the runtime database role should not own the table and should hold only
-- INSERT and SELECT privileges on "AuditEvent" (see docs/SECURITY.md), which also prevents
-- TRUNCATE by the application.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_event_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Duplicate evidence links are impossible.
-- A piece of evidence is linked to a control at most once in general, and at most once per
-- evidence requirement. (Partial indexes are not expressible in schema.prisma.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "ControlEvidence_control_evidence_general_key"
  ON "ControlEvidence" ("controlId", "evidenceId")
  WHERE "evidenceRequirementId" IS NULL;

CREATE UNIQUE INDEX "ControlEvidence_requirement_evidence_key"
  ON "ControlEvidence" ("evidenceRequirementId", "evidenceId")
  WHERE "evidenceRequirementId" IS NOT NULL;

-- Open gap-tracking items are unique per gap: at most one open task / active risk per gapKey.
-- (Enforced in the service layer; these indexes only speed up the "Tracked" lookups.)
CREATE INDEX "Task_open_gap_idx" ON "Task" ("organizationId", "gapKey")
  WHERE "gapKey" IS NOT NULL AND "status" NOT IN ('DONE', 'CANCELED');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Data integrity checks that schema.prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Control"
  ADD CONSTRAINT "Control_not_applicable_reason_check"
  CHECK ("status" <> 'NOT_APPLICABLE' OR ("notApplicableReason" IS NOT NULL AND length(btrim("notApplicableReason")) > 0));

ALTER TABLE "Evidence"
  ADD CONSTRAINT "Evidence_link_url_check"
  CHECK ("kind" <> 'LINK' OR ("url" IS NOT NULL AND "url" ~* '^https?://'));

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$');

ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase_check"
  CHECK ("email" = lower("email"));

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_email_lowercase_check"
  CHECK ("email" = lower("email"));

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_sequence_positive_check"
  CHECK ("sequence" > 0);
