import { z } from "zod";
import {
  dateOnlySchema,
  httpUrlSchema,
  optionalDateOnly,
  optionalHttpUrl,
  optionalText,
} from "@/lib/zod";

export const EVIDENCE_CATEGORIES = [
  "POLICY",
  "SCREENSHOT",
  "CONFIGURATION",
  "REPORT",
  "LOG",
  "RECORD",
  "OTHER",
] as const;
export const EVIDENCE_CATEGORY_LABELS: Record<(typeof EVIDENCE_CATEGORIES)[number], string> = {
  POLICY: "Policy",
  SCREENSHOT: "Screenshot",
  CONFIGURATION: "Configuration",
  REPORT: "Report",
  LOG: "Log",
  RECORD: "Record",
  OTHER: "Other",
};
export const EVIDENCE_STATUS_LABELS = {
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export const evidenceLinkTargetSchema = z.object({
  controlId: z.uuid(),
  evidenceRequirementId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});
export type EvidenceLinkTarget = z.infer<typeof evidenceLinkTargetSchema>;

const baseMetadata = {
  title: z.string().trim().min(2, "Enter a title.").max(200),
  description: optionalText(4000),
  category: z.enum(EVIDENCE_CATEGORIES),
  collectedAt: dateOnlySchema,
  validUntil: optionalDateOnly,
};

function checkValidity<T extends { collectedAt: string; validUntil: string | null }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.validUntil && v.validUntil < v.collectedAt) {
    ctx.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "Valid until must be on or after the collected date.",
    });
  }
}

/** Metadata sent with a file upload (route handler, JSON in a header). */
export const uploadMetadataSchema = z
  .object({ ...baseMetadata, links: z.array(evidenceLinkTargetSchema).max(50).default([]) })
  .superRefine(checkValidity);

/** Metadata for a new version of existing evidence. */
export const versionMetadataSchema = z.object({
  evidenceId: z.uuid(),
  collectedAt: optionalDateOnly,
});

export const createLinkEvidenceSchema = z
  .object({
    ...baseMetadata,
    url: httpUrlSchema,
    links: z.array(evidenceLinkTargetSchema).max(50).default([]),
  })
  .superRefine(checkValidity);

export const updateEvidenceSchema = z
  .object({ ...baseMetadata, url: optionalHttpUrl })
  .superRefine(checkValidity);

export const reviewEvidenceSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    comment: optionalText(2000),
    validUntil: optionalDateOnly,
  })
  .superRefine((v, ctx) => {
    if (v.decision === "reject" && !v.comment) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Explain why the evidence is rejected.",
      });
    }
  });

export const linkEvidenceSchema = z.object({
  evidenceId: z.uuid(),
  controlId: z.uuid(),
  evidenceRequirementId: z
    .uuid()
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const evidenceListQuerySchema = z.object({
  tab: z.enum(["all", "review", "missing", "expiring"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]).optional().catch(undefined),
  category: z.enum(EVIDENCE_CATEGORIES).optional().catch(undefined),
  control: z.uuid().optional().catch(undefined),
  uploader: z
    .union([z.literal("me"), z.uuid()])
    .optional()
    .catch(undefined),
  freshness: z
    .enum(["CURRENT", "EXPIRING_SOON", "EXPIRED", "NO_EXPIRY"])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type EvidenceListQuery = z.infer<typeof evidenceListQuerySchema>;
