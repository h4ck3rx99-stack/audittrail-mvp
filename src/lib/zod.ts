import { z } from "zod";
import { isDateOnly } from "@/lib/dates";

/** Optional free text: trimmed, length-limited, empty → null, missing → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const dateOnlySchema = z.string().refine(isDateOnly, "Enter a valid date.");

/** Optional calendar date (YYYY-MM-DD): empty or missing → null. */
export const optionalDateOnly = dateOnlySchema
  .or(z.literal(""))
  .nullish()
  .transform((v) => (v ? v : null));

/** Optional UUID reference: empty or missing → null. */
export const nullableId = z
  .uuid("Invalid identifier.")
  .or(z.literal(""))
  .nullish()
  .transform((v) => (v ? v : null));

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048, "The URL is too long.")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter an http:// or https:// URL.");

export const optionalHttpUrl = httpUrlSchema
  .or(z.literal(""))
  .nullish()
  .transform((v) => (v ? v : null));

/** Checkbox / boolean that may arrive as a string from FormData. */
export const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "on", "off", "1", "0"])])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on" || v === "1");
