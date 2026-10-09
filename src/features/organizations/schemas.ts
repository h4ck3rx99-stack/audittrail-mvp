import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import {
  dateOnlySchema,
  httpUrlSchema,
  optionalDateOnly,
  optionalHttpUrl,
  optionalText,
} from "@/lib/zod";

export { dateOnlySchema, httpUrlSchema, optionalDateOnly };

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "apps",
  "account",
  "accounts",
  "auth",
  "assets",
  "audittrail",
  "billing",
  "blog",
  "dashboard",
  "docs",
  "help",
  "invite",
  "invites",
  "login",
  "logout",
  "new",
  "next",
  "onboarding",
  "org",
  "orgs",
  "organization",
  "organizations",
  "public",
  "reset-password",
  "forgot-password",
  "root",
  "search",
  "security",
  "settings",
  "signup",
  "signin",
  "static",
  "status",
  "support",
  "system",
  "terms",
  "privacy",
  "www",
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(48, "Use at most 48 characters.")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Use lowercase letters, numbers and hyphens; start and end with a letter or number.",
  )
  .refine((s) => !s.includes("--"), "Avoid consecutive hyphens.")
  .refine((s) => !RESERVED_SLUGS.has(s), "This name is reserved. Choose another.");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export const EMPLOYEE_RANGES = [
  "R1_10",
  "R11_50",
  "R51_200",
  "R201_500",
  "R501_1000",
  "R1000_PLUS",
] as const;
export const EMPLOYEE_RANGE_LABELS: Record<(typeof EMPLOYEE_RANGES)[number], string> = {
  R1_10: "1–10",
  R11_50: "11–50",
  R51_200: "51–200",
  R201_500: "201–500",
  R501_1000: "501–1,000",
  R1000_PLUS: "1,000+",
};
export const AUDIT_TYPES = ["TYPE_1", "TYPE_2", "UNDECIDED"] as const;
export const AUDIT_TYPE_LABELS: Record<(typeof AUDIT_TYPES)[number], string> = {
  TYPE_1: "Type I",
  TYPE_2: "Type II",
  UNDECIDED: "Undecided",
};

const auditPlanning = {
  auditType: z.enum(AUDIT_TYPES),
  targetAuditDate: optionalDateOnly,
  observationStart: optionalDateOnly,
  observationEnd: optionalDateOnly,
};

function checkObservation<
  T extends { observationStart: string | null; observationEnd: string | null },
>(v: T, ctx: z.RefinementCtx) {
  if (v.observationStart && v.observationEnd && v.observationEnd < v.observationStart) {
    ctx.addIssue({
      code: "custom",
      path: ["observationEnd"],
      message: "The observation period must end after it starts.",
    });
  }
}

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the organization name.").max(100),
    slug: slugSchema,
    industry: optionalText(100),
    employeeRange: z.enum(EMPLOYEE_RANGES),
    description: optionalText(500),
    frameworkKey: z.string().trim().min(1).max(50),
    scopeCodes: z.array(z.string().trim().min(1).max(50)).max(20),
    starter: z.boolean(),
    timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone.").default("UTC"),
    ...auditPlanning,
  })
  .superRefine(checkObservation);
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the organization name.").max(100),
    legalName: optionalText(200),
    website: optionalHttpUrl,
    industry: optionalText(100),
    employeeRange: z.enum(EMPLOYEE_RANGES),
    description: optionalText(500),
    timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone."),
    ...auditPlanning,
  })
  .superRefine(checkObservation);

export const evidencePolicySchema = z.object({
  requireIndependentEvidenceReview: z.boolean(),
  defaultEvidenceValidityDays: z.coerce
    .number()
    .int("Enter whole days.")
    .min(1, "Use at least 1 day.")
    .max(1825, "Use at most 1,825 days."),
});

export const frameworkScopeSchema = z.object({
  frameworkKey: z.string().trim().min(1).max(50),
  scopeCodes: z.array(z.string().trim().min(1).max(50)).max(20),
});

export const adoptFrameworkSchema = z.object({
  frameworkKey: z.string().trim().min(1).max(50),
  scopeCodes: z.array(z.string().trim().min(1).max(50)).max(20),
  starter: z.boolean(),
});
