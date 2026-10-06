import { db } from "@/server/db";

/** Every table except the global framework catalog (synced once in global setup). */
const TENANT_AND_IDENTITY_TABLES = [
  "AuditEvent",
  "AuditChainHead",
  "Notification",
  "RateLimitBucket",
  "TaskControl",
  "Task",
  "RiskControl",
  "Risk",
  "ControlEvidence",
  "EvidenceVersion",
  "Evidence",
  "EvidenceRequirement",
  "ControlReview",
  "ControlRequirement",
  "Control",
  "OrganizationFrameworkScope",
  "OrganizationFramework",
  "OrganizationCounter",
  "Invitation",
  "OrganizationMember",
  "Organization",
  "Verification",
  "Session",
  "Account",
  "User",
];

/**
 * Resets the test database. TRUNCATE does not fire the row-level append-only trigger on
 * AuditEvent, which is exactly why the trigger deliberately does not cover TRUNCATE.
 */
export async function resetDatabase() {
  const list = TENANT_AND_IDENTITY_TABLES.map((t) => `"${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
