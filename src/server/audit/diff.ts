import { toDateOnly } from "@/lib/dates";

/**
 * Change diffs for audit events: { field: { from, to } } for changed fields only.
 * Sensitive fields are always redacted, regardless of what a caller passes in.
 */

export type FieldChange = { from: unknown; to: unknown };
export type Changes = Record<string, FieldChange>;

export const REDACTED = "[REDACTED]";

const SENSITIVE_FIELD_RE = /(password|passwordhash|token|tokenhash|secret|cookie|apikey|authorization)/i;

export function isSensitiveField(field: string): boolean {
  return SENSITIVE_FIELD_RE.test(field);
}

function normalize(value: unknown, dateOnlyFields: ReadonlySet<string>, field: string): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) {
    return dateOnlyFields.has(field) ? toDateOnly(value) : value.toISOString();
  }
  return value;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Computes a diff over the given fields. `before` / `after` may contain extra fields; only the
 * listed ones are compared. Date-only fields are rendered as YYYY-MM-DD.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
  options: { dateOnly?: readonly string[] } = {},
): Changes {
  const dateOnly = new Set(options.dateOnly ?? []);
  const changes: Changes = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = normalize(before[field], dateOnly, field);
    const to = normalize(after[field], dateOnly, field);
    if (equal(from, to)) continue;
    changes[field] = isSensitiveField(field) ? { from: REDACTED, to: REDACTED } : { from, to };
  }
  return changes;
}

/** Redacts sensitive keys anywhere inside an arbitrary JSON-like value (used for metadata). */
export function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveField(k) ? REDACTED : redactDeep(v);
    }
    return out;
  }
  return value;
}

/** Redacts a Changes object (defense in depth: callers should already only pass safe fields). */
export function redactChanges(changes: Changes): Changes {
  const out: Changes = {};
  for (const [field, change] of Object.entries(changes)) {
    out[field] = isSensitiveField(field)
      ? { from: REDACTED, to: REDACTED }
      : { from: redactDeep(change.from), to: redactDeep(change.to) };
  }
  return out;
}

export function hasChanges(changes: Changes): boolean {
  return Object.keys(changes).length > 0;
}
