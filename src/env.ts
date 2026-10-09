import { z } from "zod";

/**
 * All configuration is validated here, once, when the module is first loaded.
 * Only NEXT_PUBLIC_* values may ever reach the client bundle; this module is imported
 * exclusively from server modules and scripts.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "Must be a postgres:// or postgresql:// connection string");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Where this instance is deployed. "production" turns on strict validation
     * (no local storage driver, no console email, https APP_URL, CRON_SECRET required).
     * `next start` on a laptop is NODE_ENV=production but DEPLOYMENT_ENV=local.
     */
    DEPLOYMENT_ENV: z.enum(["local", "production"]).default("local"),

    DATABASE_URL: postgresUrl,
    DATABASE_URL_TEST: postgresUrl.optional(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    APP_URL: z
      .string()
      .regex(
        /^https?:\/\/[^/]+$/,
        "APP_URL must be an origin such as https://app.example.com (no trailing slash or path)",
      ),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().min(1).default("./storage"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: bool,
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(25),

    EMAIL_DRIVER: z.enum(["console", "smtp", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("AuditTrail <no-reply@audittrail.local>"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: bool,
    RESEND_API_KEY: optionalString,

    CRON_SECRET: optionalString.pipe(
      z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
    ),
    /** Number of trusted reverse-proxy hops in front of the app. 0 = never read X-Forwarded-For. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    ALLOW_DEMO_SEED: bool,
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: "Required when STORAGE_DRIVER=s3" });
        }
      }
    }
    if (env.EMAIL_DRIVER === "smtp" && !env.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "Required when EMAIL_DRIVER=smtp",
      });
    }
    if (env.EMAIL_DRIVER === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Required when EMAIL_DRIVER=resend",
      });
    }
    if (env.DEPLOYMENT_ENV === "production") {
      if (env.STORAGE_DRIVER === "local") {
        ctx.addIssue({
          code: "custom",
          path: ["STORAGE_DRIVER"],
          message: "The local storage driver is not allowed when DEPLOYMENT_ENV=production",
        });
      }
      if (env.EMAIL_DRIVER === "console") {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_DRIVER"],
          message: "The console email driver is not allowed when DEPLOYMENT_ENV=production",
        });
      }
      if (!env.APP_URL.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL must use https in production",
        });
      }
      if (!env.CRON_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["CRON_SECRET"],
          message: "CRON_SECRET is required in production",
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Print variable names and messages only; never values.
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const env: Env = load();

export const isProductionDeployment = env.DEPLOYMENT_ENV === "production";
export const secureCookies = env.APP_URL.startsWith("https://");
export const appOrigin = new URL(env.APP_URL).origin;
