/**
 * Domain errors. Services throw these; entry points map them centrally to action results
 * (src/server/result.ts) and HTTP responses (src/server/http.ts).
 *
 * Resources belonging to another tenant always surface as NotFoundError (404), never
 * ForbiddenError, so the existence of foreign resources is not revealed.
 */

export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type FieldErrors = Record<string, string[]>;

export class ValidationError extends AppError {
  readonly code = "VALIDATION" as const;
  readonly status = 400;
  readonly fieldErrors?: FieldErrors;
  constructor(message = "Some fields are invalid.", fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly status = 409;
  constructor(message = "This record was changed by someone else. Reload and try again.") {
    super(message);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  readonly status = 429;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = "Too many attempts. Try again shortly.") {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly status = 401;
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Prisma known-request error codes we translate into domain errors. */
export function prismaErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && /^P\d{4}$/.test(code)) return code;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}
