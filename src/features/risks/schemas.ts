import { z } from "zod";
import { nullableId, optionalDateOnly, optionalText } from "@/lib/zod";
import { PRIORITIES } from "@/features/controls/schemas";

export const RISK_STATUSES = ["OPEN", "IN_PROGRESS", "MITIGATED", "ACCEPTED", "CLOSED"] as const;
export const RISK_STATUS_LABELS: Record<(typeof RISK_STATUSES)[number], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  MITIGATED: "Mitigated",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};
export const RESOLVED_RISK_STATUSES = ["MITIGATED", "ACCEPTED", "CLOSED"] as const;
export const RISK_KINDS = ["GAP", "RISK"] as const;
export const RISK_KIND_LABELS: Record<(typeof RISK_KINDS)[number], string> = { GAP: "Gap", RISK: "Risk" };



export const createRiskSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: optionalText(10000),
  kind: z.enum(RISK_KINDS),
  severity: z.enum(PRIORITIES),
  ownerId: nullableId,
  dueDate: optionalDateOnly,
  treatmentPlan: optionalText(10000),
  controlIds: z.array(z.uuid()).max(50).default([]),
  gapKey: optionalText(120),
});

export const updateRiskSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: optionalText(10000),
  kind: z.enum(RISK_KINDS),
  severity: z.enum(PRIORITIES),
  ownerId: nullableId,
  dueDate: optionalDateOnly,
  treatmentPlan: optionalText(10000),
  controlIds: z.array(z.uuid()).max(50).default([]),
});

export const riskStatusSchema = z
  .object({ status: z.enum(RISK_STATUSES), resolutionNotes: optionalText(10000) })
  .superRefine((v, ctx) => {
    if ((RESOLVED_RISK_STATUSES as readonly string[]).includes(v.status) && !v.resolutionNotes) {
      ctx.addIssue({ code: "custom", path: ["resolutionNotes"], message: "Resolution notes are required for this status." });
    }
  });

export const riskListQuerySchema = z.object({
  tab: z.enum(["gaps", "register"]).optional().catch(undefined),
  status: z.enum([...RISK_STATUSES, "active"]).optional().catch(undefined),
  severity: z.enum(PRIORITIES).optional().catch(undefined),
  kind: z.enum(RISK_KINDS).optional().catch(undefined),
  owner: z.union([z.literal("me"), z.uuid()]).optional().catch(undefined),
  archived: z.enum(["1"]).optional().catch(undefined),
  gapType: z.string().max(40).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type RiskListQuery = z.infer<typeof riskListQuerySchema>;
