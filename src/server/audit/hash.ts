import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted lexicographically at every depth, no whitespace,
 * `undefined` object members omitted (as JSON.stringify does), BigInt rendered as a string.
 * Postgres jsonb reorders keys, so hashing must never depend on insertion order.
 */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  return null;
}

/**
 * Normalizes an arbitrary value into plain JSON exactly as it will be stored in a jsonb column
 * (Dates → ISO strings, undefined dropped, BigInt → string). Hash the normalized value and store
 * the same normalized value, so verification always recomputes an identical hash.
 */
export function toStorableJson(value: unknown): JsonValue | null {
  if (value === undefined || value === null) return null;
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

export type HashableAuditEvent = {
  chainKey: string;
  sequence: bigint;
  occurredAt: Date;
  organizationId: string | null;
  actorType: "USER" | "SYSTEM";
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  changes: JsonValue | null;
  metadata: JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  prevHash: string | null;
};

/**
 * SHA-256 over the canonical JSON of every stored field except `id` and `hash` itself.
 * This is a superset of the minimum field list in the specification (it also covers the actor
 * snapshot, resource label and request context), so tampering with any of them is detected.
 */
export function computeAuditEventHash(event: HashableAuditEvent): string {
  const payload = {
    chainKey: event.chainKey,
    sequence: event.sequence.toString(),
    occurredAt: event.occurredAt.toISOString(),
    organizationId: event.organizationId,
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    actorEmail: event.actorEmail,
    actorName: event.actorName,
    actorRole: event.actorRole,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    resourceLabel: event.resourceLabel,
    changes: event.changes,
    metadata: event.metadata,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    requestId: event.requestId,
    prevHash: event.prevHash,
  };
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

export function orgChainKey(organizationId: string): string {
  return `org:${organizationId}`;
}

export function userChainKey(userId: string): string {
  return `user:${userId}`;
}
