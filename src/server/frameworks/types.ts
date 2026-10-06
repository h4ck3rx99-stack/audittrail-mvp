import type { Priority, ReviewFrequency } from "@/generated/prisma/enums";

/**
 * Framework content modules (SOC 2 today; ISO 27001, HIPAA, … later) implement this shape.
 * The core never branches on a specific framework: it only reads this data after sync.
 */
export type RequirementDefinition = {
  code: string;
  parentCode: string | null;
  title: string;
  /** Original short summary. Never copy official framework text verbatim. */
  summary: string;
  kind: "GROUP" | "REQUIREMENT";
  /** Top-level GROUPs only: always in scope (e.g. SOC 2 Security). */
  isScopeRequired?: boolean;
};

export type EvidenceRequirementTemplateDefinition = {
  key: string;
  title: string;
  description: string;
  freshnessDays: number;
  isRequired?: boolean;
};

export type ControlTemplateDefinition = {
  code: string;
  name: string;
  description: string;
  guidance: string;
  domain: string;
  priority: Priority;
  reviewFrequency: ReviewFrequency;
  requirementCodes: string[];
  evidence: EvidenceRequirementTemplateDefinition[];
};

export type FrameworkDefinition = {
  key: string;
  name: string;
  shortName: string;
  version: string;
  description: string;
  requirementLabel: string;
  requirementShortLabel: string;
  requirements: RequirementDefinition[];
  controlTemplates: ControlTemplateDefinition[];
};

export const CONTROL_DOMAINS: Record<string, string> = {
  GV: "Governance",
  HR: "People",
  RM: "Risk Management",
  AC: "Access Control",
  IN: "Infrastructure and Network",
  CM: "Change Management",
  OP: "Operations and Monitoring",
  VM: "Vulnerability Management",
  IR: "Incident Response",
  BC: "Business Continuity",
  DP: "Data Protection and Confidentiality",
  VN: "Vendor Management",
};
