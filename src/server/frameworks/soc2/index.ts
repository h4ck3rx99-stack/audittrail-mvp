import type { FrameworkDefinition } from "../types";
import { SOC2_CONTROL_TEMPLATES } from "./control-templates";
import { SOC2_REQUIREMENTS } from "./requirements";

export const SOC2: FrameworkDefinition = {
  key: "soc2",
  name: "SOC 2",
  shortName: "SOC 2",
  version: "2017 TSC (revised points of focus, 2022)",
  description:
    "AICPA Trust Services Criteria for security, availability, processing integrity, confidentiality and privacy. A SOC 2 report is an attestation issued by an independent CPA firm, not a certification.",
  requirementLabel: "Trust Services Criteria",
  requirementShortLabel: "Criteria",
  requirements: SOC2_REQUIREMENTS,
  controlTemplates: SOC2_CONTROL_TEMPLATES,
};
