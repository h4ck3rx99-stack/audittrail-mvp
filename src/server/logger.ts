import "server-only";
import pino from "pino";
import { env } from "@/env";

/**
 * Structured JSON logger. Sensitive values are redacted by path; never log request bodies
 * that may contain passwords or tokens.
 */
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  base: { app: "audittrail" },
  redact: {
    paths: [
      "password",
      "*.password",
      "currentPassword",
      "*.currentPassword",
      "newPassword",
      "*.newPassword",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "tokenHash",
      "*.tokenHash",
      "cookie",
      "*.cookie",
      "headers.cookie",
      "headers.authorization",
      "authorization",
      "*.authorization",
      "secret",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
});

export type Logger = typeof logger;
