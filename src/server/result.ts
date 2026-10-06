import "server-only";
import { unstable_rethrow } from "next/navigation";
import { refresh } from "next/cache";
import { isAppError, isUniqueViolation, prismaErrorCode, type FieldErrors } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Server Actions return a Result instead of throwing, so clients can render field errors and
 * toasts. Stack traces and database errors never leave the server.
 */
import type { ActionError, ActionResult } from "@/lib/action-result";
export type { ActionError, ActionResult };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function toActionError(error: unknown): ActionError {
  if (isAppError(error)) {
    const fieldErrors = "fieldErrors" in error ? (error.fieldErrors as FieldErrors | undefined) : undefined;
    return { code: error.code, message: error.message, ...(fieldErrors ? { fieldErrors } : {}) };
  }
  if (isUniqueViolation(error)) {
    return { code: "CONFLICT", message: "A record with these values already exists." };
  }
  if (prismaErrorCode(error) === "P2025") {
    return { code: "NOT_FOUND", message: "Not found" };
  }
  return { code: "INTERNAL", message: "Something went wrong. Try again, and contact support if it continues." };
}

/**
 * Runs an action body and maps errors to a Result. Next.js control-flow errors (redirect,
 * notFound) are rethrown so they keep working inside actions.
 */
export async function runAction<T>(
  name: string,
  fn: () => Promise<T>,
  options: { refresh?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    // Re-render the current route so server components show the committed change.
    if (options.refresh !== false) refresh();
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    const mapped = toActionError(error);
    if (mapped.code === "INTERNAL") {
      logger.error({ err: error, action: name }, "server action failed");
    } else {
      logger.info({ action: name, code: mapped.code }, "server action rejected");
    }
    return { ok: false, error: mapped };
  }
}
