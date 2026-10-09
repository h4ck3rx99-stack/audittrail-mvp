import "server-only";
import { appOrigin } from "@/env";
import { isAppError, RateLimitedError } from "@/server/errors";
import { logger } from "@/server/logger";

/** Maps domain errors to JSON HTTP responses for route handlers. Never leaks internals. */
export function errorResponse(error: unknown, requestId?: string): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (requestId) headers["X-Request-Id"] = requestId;
  if (isAppError(error)) {
    if (error instanceof RateLimitedError) headers["Retry-After"] = String(error.retryAfterSeconds);
    const fieldErrors = "fieldErrors" in error ? error.fieldErrors : undefined;
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(fieldErrors ? { fieldErrors } : {}),
        },
      },
      { status: error.status, headers },
    );
  }
  logger.error({ err: error, requestId }, "route handler failed");
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500, headers },
  );
}

/**
 * CSRF defense for mutating route handlers: the Origin header must match the app origin.
 * (Server Actions get the equivalent check from Next.js.)
 */
export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === appOrigin;
}
