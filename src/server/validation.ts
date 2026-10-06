import type { z } from "zod";
import { ValidationError, type FieldErrors } from "@/server/errors";

/** Parses input with a zod schema; failures become a ValidationError with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = result.error.issues[0]?.message;
  throw new ValidationError(
    Object.keys(fieldErrors).length === 1 && fieldErrors._form ? (first ?? "Invalid input.") : "Some fields need attention.",
    fieldErrors,
  );
}

/** Converts FormData into a plain object; repeated keys become arrays. */
export function formDataToObject(formData: FormData, arrayKeys: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = arrayKeys.includes(key) ? values : values[0];
  }
  for (const key of arrayKeys) out[key] ??= [];
  return out;
}
