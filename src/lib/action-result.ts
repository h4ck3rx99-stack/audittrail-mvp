import type { ErrorCode, FieldErrors } from "@/server/errors";

/** Result shape returned by every Server Action (shared by server and client code). */
export type ActionError = {
  code: ErrorCode | "INTERNAL";
  message: string;
  fieldErrors?: FieldErrors;
};
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };
