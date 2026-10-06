import { z } from "zod";
import { nullableId, optionalDateOnly, optionalText } from "@/lib/zod";

export const CONTROL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "NOT_APPLICABLE"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const REVIEW_FREQUENCIES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"] as const;
export const REVIEW_OUTCOMES = ["EFFECTIVE", "NEEDS_IMPROVEMENT", "INEFFECTIVE"] as const;

export const CONTROL_STATUS_LABELS: Record<(typeof CONTROL_STATUSES)[number], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IMPLEMENTED: "Implemented",
  NOT_APPLICABLE: "Not applicable",
};
export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
export const REVIEW_FREQUENCY_LABELS: Record<(typeof REVIEW_FREQUENCIES)[number], string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUALLY: "Semi-annually",
  ANNUALLY: "Annually",
};
export const REVIEW_OUTCOME_LABELS: Record<(typeof REVIEW_OUTCOMES)[number], string> = {
  EFFECTIVE: "Effective",
  NEEDS_IMPROVEMENT: "Needs improvement",
  INEFFECTIVE: "Ineffective",
};

export const controlCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Use at least 2 characters.")
  .max(20, "Use at most 20 characters.")
  .regex(/^[A-Z0-9][A-Z0-9.-]*$/, "Use letters, numbers, dots and hyphens.");

const id = z.uuid("Invalid identifier.");
const longText = optionalText;

export const createControlSchema = z.object({
  code: controlCodeSchema,
  name: z.string().trim().min(3, "Enter a name.").max(200),
  description: z.string().trim().min(1, "Describe the control.").max(4000),
  domain: longText(50),
  priority: z.enum(PRIORITIES),
  reviewFrequency: z.enum(REVIEW_FREQUENCIES),
  ownerId: nullableId,
  requirementIds: z.array(id).max(100),
});

export const updateControlDefinitionSchema = z.object({
  version: z.coerce.number().int().min(1),
  code: controlCodeSchema,
  name: z.string().trim().min(3, "Enter a name.").max(200),
  description: z.string().trim().min(1, "Describe the control.").max(4000),
  domain: longText(50),
  priority: z.enum(PRIORITIES),
  reviewFrequency: z.enum(REVIEW_FREQUENCIES),
});

export const updateControlStatusSchema = z
  .object({
    version: z.coerce.number().int().min(1),
    status: z.enum(CONTROL_STATUSES),
    notApplicableReason: longText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "NOT_APPLICABLE" && !v.notApplicableReason) {
      ctx.addIssue({ code: "custom", path: ["notApplicableReason"], message: "Explain why this control does not apply." });
    }
  });

export const updateControlNotesSchema = z.object({
  version: z.coerce.number().int().min(1),
  implementationNotes: longText(10000),
  notes: longText(10000),
});

export const assignOwnerSchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
  ownerId: nullableId,
});

export const setNextReviewDateSchema = z.object({
  version: z.coerce.number().int().min(1),
  nextReviewDate: optionalDateOnly,
});

export const recordReviewSchema = z.object({
  outcome: z.enum(REVIEW_OUTCOMES),
  notes: z.string().trim().min(1, "Summarize what you reviewed.").max(10000),
  nextReviewDate: optionalDateOnly,
});

export const bulkAssignSchema = z.object({
  controlIds: z.array(id).min(1, "Select at least one control.").max(200),
  ownerId: nullableId,
});

export const bulkStatusSchema = z
  .object({
    controlIds: z.array(id).min(1, "Select at least one control.").max(200),
    status: z.enum(CONTROL_STATUSES),
    notApplicableReason: longText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "NOT_APPLICABLE" && !v.notApplicableReason) {
      ctx.addIssue({ code: "custom", path: ["notApplicableReason"], message: "Explain why these controls do not apply." });
    }
  });

export const evidenceRequirementSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: longText(2000),
  freshnessDays: z.coerce.number().int().min(1, "Use at least 1 day.").max(1825, "Use at most 1,825 days."),
  isRequired: z.boolean(),
});

export const controlListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(CONTROL_STATUSES).optional().catch(undefined),
  health: z.enum(["READY", "ATTENTION", "NOT_READY"]).optional().catch(undefined),
  owner: z.union([z.literal("me"), z.literal("unassigned"), z.uuid()]).optional().catch(undefined),
  group: z.string().trim().max(50).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  overdue: z.enum(["1"]).optional().catch(undefined),
  archived: z.enum(["1"]).optional().catch(undefined),
  sort: z.enum(["code", "name", "status", "health", "owner", "nextReview", "priority", "evidence"]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type ControlListQuery = z.infer<typeof controlListQuerySchema>;
