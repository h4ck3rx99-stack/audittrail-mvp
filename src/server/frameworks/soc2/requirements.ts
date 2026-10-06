import type { RequirementDefinition } from "../types";

/**
 * SOC 2 Trust Services Criteria (2017 criteria, revised points of focus), organized as
 * category → series → criterion. Every summary below is original wording written for
 * AuditTrail; the official AICPA text is copyrighted and is not reproduced.
 */

const group = (code: string, parentCode: string | null, title: string, summary: string, isScopeRequired = false): RequirementDefinition => ({
  code,
  parentCode,
  title,
  summary,
  kind: "GROUP",
  isScopeRequired,
});

const criterion = (code: string, parentCode: string, title: string, summary: string): RequirementDefinition => ({
  code,
  parentCode,
  title,
  summary,
  kind: "REQUIREMENT",
});

export const SOC2_REQUIREMENTS: RequirementDefinition[] = [
  // ── Security (common criteria) ────────────────────────────────────────────
  group(
    "SECURITY",
    null,
    "Security",
    "The common criteria: the system is protected against unauthorized access, use and change. Every SOC 2 examination includes this category.",
    true,
  ),

  group("CC1", "SECURITY", "Control Environment", "Tone at the top, oversight, structure, competence and accountability."),
  criterion("CC1.1", "CC1", "Integrity and ethical values", "Leadership sets clear expectations for ethical conduct, lives by them, and acts when people fall short of them."),
  criterion("CC1.2", "CC1", "Independent oversight", "A governing body that is independent of day-to-day management oversees how internal controls are designed and how well they work."),
  criterion("CC1.3", "CC1", "Structure, reporting lines and authority", "Management defines the organizational structure, reporting lines and decision rights needed to meet objectives, with oversight from the governing body."),
  criterion("CC1.4", "CC1", "Competence", "The organization hires, develops and retains people with the skills its objectives require."),
  criterion("CC1.5", "CC1", "Accountability", "People are held responsible for their part in internal control as the organization pursues its objectives."),

  group("CC2", "SECURITY", "Communication and Information", "Using good information and communicating it inside and outside the organization."),
  criterion("CC2.1", "CC2", "Quality information", "Relevant, reliable information is collected or produced and used to keep internal control working."),
  criterion("CC2.2", "CC2", "Internal communication", "Control objectives and individual responsibilities are communicated internally so people can do their part."),
  criterion("CC2.3", "CC2", "External communication", "The organization communicates with customers, vendors and other outside parties about matters that affect internal control."),

  group("CC3", "SECURITY", "Risk Assessment", "Setting objectives and identifying, analyzing and responding to risk."),
  criterion("CC3.1", "CC3", "Clear objectives", "Objectives are defined clearly enough that the risks to achieving them can be identified and evaluated."),
  criterion("CC3.2", "CC3", "Risk identification and analysis", "Risks to objectives are identified across the organization and analyzed to decide how each should be handled."),
  criterion("CC3.3", "CC3", "Fraud risk", "The possibility of fraud is considered explicitly when risks are assessed."),
  criterion("CC3.4", "CC3", "Significant change", "Changes that could materially affect internal control, such as new systems, leadership or business lines, are identified and assessed."),

  group("CC4", "SECURITY", "Monitoring Activities", "Checking that controls are present and working, and acting on deficiencies."),
  criterion("CC4.1", "CC4", "Ongoing and periodic evaluation", "Continuous and point-in-time evaluations confirm that the parts of internal control exist and operate as intended."),
  criterion("CC4.2", "CC4", "Deficiency reporting", "Control deficiencies are evaluated and reported promptly to the people responsible for fixing them, including leadership when warranted."),

  group("CC5", "SECURITY", "Control Activities", "Choosing, building and deploying controls through policy and procedure."),
  criterion("CC5.1", "CC5", "Control selection", "Control activities are chosen and designed to bring risks to objectives down to acceptable levels."),
  criterion("CC5.2", "CC5", "Technology controls", "General controls over technology are chosen and built to support the organization's objectives."),
  criterion("CC5.3", "CC5", "Policies and procedures", "Controls are put into practice through policies that state expectations and procedures that carry them out."),

  group("CC6", "SECURITY", "Logical and Physical Access Controls", "Who and what can reach systems, data and facilities."),
  criterion("CC6.1", "CC6", "Logical access security", "Access-control software, infrastructure and architecture protect information assets from security events."),
  criterion("CC6.2", "CC6", "Provisioning and deprovisioning", "People are registered and approved before they receive credentials, and their access is removed when it is no longer needed."),
  criterion("CC6.3", "CC6", "Least privilege", "Access is granted, changed and removed according to role and need, keeping privileges minimal and duties separated."),
  criterion("CC6.4", "CC6", "Physical access", "Only authorized people can physically reach facilities and sensitive assets such as server rooms and backup media."),
  criterion("CC6.5", "CC6", "Asset disposal", "Before hardware or media leave the organization's control, the data on them is made unrecoverable."),
  criterion("CC6.6", "CC6", "External threats", "Access controls defend the system against threats from outside its boundaries."),
  criterion("CC6.7", "CC6", "Data in transit and on devices", "Moving information is limited to authorized users and processes and is protected in transit, on removable media and on endpoints."),
  criterion("CC6.8", "CC6", "Malicious software", "Controls prevent, or detect and respond to, unauthorized or malicious software."),

  group("CC7", "SECURITY", "System Operations", "Detecting, investigating and recovering from security events."),
  criterion("CC7.1", "CC7", "Vulnerability and configuration detection", "Detection and monitoring find configuration changes that weaken security and newly discovered vulnerabilities."),
  criterion("CC7.2", "CC7", "Anomaly monitoring", "Systems are monitored for unusual activity that could indicate an attack, an error or an environmental problem."),
  criterion("CC7.3", "CC7", "Event evaluation", "Security events are evaluated to decide whether they are incidents that threaten objectives."),
  criterion("CC7.4", "CC7", "Incident response", "Confirmed incidents are handled through a defined program to understand, contain, fix and communicate them."),
  criterion("CC7.5", "CC7", "Incident recovery", "Recovery activities for security incidents are planned and carried out."),

  group("CC8", "SECURITY", "Change Management", "Controlling changes to systems and data."),
  criterion("CC8.1", "CC8", "Controlled change", "Changes to infrastructure, data, software and procedures are authorized, documented, tested, approved and deployed in a controlled way."),

  group("CC9", "SECURITY", "Risk Mitigation", "Preparing for disruption and managing vendor risk."),
  criterion("CC9.1", "CC9", "Business disruption", "Activities to reduce the impact of potential business disruptions are identified and developed."),
  criterion("CC9.2", "CC9", "Vendor and partner risk", "Risks arising from vendors and business partners are assessed and managed."),

  // ── Availability ──────────────────────────────────────────────────────────
  group("AVAILABILITY", null, "Availability", "The system is available for operation and use as committed to customers."),
  group("A1", "AVAILABILITY", "Additional criteria for availability", "Capacity, recovery infrastructure and recovery testing."),
  criterion("A1.1", "A1", "Capacity management", "Processing capacity and usage are monitored and evaluated so demand can be met, and capacity is added before it runs out."),
  criterion("A1.2", "A1", "Backup and recovery infrastructure", "Backups, recovery infrastructure and environmental safeguards are designed, operated and monitored to support availability commitments."),
  criterion("A1.3", "A1", "Recovery testing", "Recovery procedures are tested regularly to show the system can actually be restored."),

  // ── Confidentiality ───────────────────────────────────────────────────────
  group("CONFIDENTIALITY", null, "Confidentiality", "Information designated as confidential is protected as committed."),
  group("C1", "CONFIDENTIALITY", "Additional criteria for confidentiality", "Identifying, protecting and disposing of confidential information."),
  criterion("C1.1", "C1", "Protecting confidential information", "Confidential information is identified and protected throughout its life to meet confidentiality commitments."),
  criterion("C1.2", "C1", "Disposing of confidential information", "Confidential information is securely destroyed when it is no longer needed or its retention period ends."),

  // ── Processing Integrity ──────────────────────────────────────────────────
  group("PROCESSING_INTEGRITY", null, "Processing Integrity", "System processing is complete, valid, accurate, timely and authorized."),
  group("PI1", "PROCESSING_INTEGRITY", "Additional criteria for processing integrity", "Specifications, inputs, processing, outputs and storage."),
  criterion("PI1.1", "PI1", "Processing specifications", "What the system processes, including data definitions and product specifications, is documented and communicated."),
  criterion("PI1.2", "PI1", "Input controls", "Inputs are validated so only complete and accurate data enters processing."),
  criterion("PI1.3", "PI1", "Processing controls", "Processing is controlled so results are complete, accurate and produced on time."),
  criterion("PI1.4", "PI1", "Output controls", "Outputs are delivered completely, accurately and on time, and only to intended recipients."),
  criterion("PI1.5", "PI1", "Stored data", "Inputs, items in process and outputs are stored completely and accurately and protected for as long as they are kept."),

  // ── Privacy ───────────────────────────────────────────────────────────────
  group("PRIVACY", null, "Privacy", "Personal information is collected, used, retained, disclosed and disposed of as committed."),
  group("P1", "PRIVACY", "Notice", "Telling people how their personal information is handled."),
  criterion("P1.1", "P1", "Privacy notice", "People are told, in a notice they can find and understand, how their personal information is collected, used, kept, shared and disposed of."),
  group("P2", "PRIVACY", "Choice and consent", "Offering choices and recording consent."),
  criterion("P2.1", "P2", "Choice and consent", "People are offered meaningful choices about their personal information, and their consent is obtained and recorded where required."),
  group("P3", "PRIVACY", "Collection", "Collecting only what is needed."),
  criterion("P3.1", "P3", "Purpose-limited collection", "Personal information is collected only for the purposes described in the privacy notice."),
  criterion("P3.2", "P3", "Explicit consent", "Where explicit consent is required, it is obtained at collection and people are told what happens if they decline."),
  group("P4", "PRIVACY", "Use, retention and disposal", "Using, keeping and destroying personal information appropriately."),
  criterion("P4.1", "P4", "Purpose-limited use", "Personal information is used only for the purposes it was collected for."),
  criterion("P4.2", "P4", "Retention", "Personal information is kept only as long as its stated purposes require."),
  criterion("P4.3", "P4", "Disposal", "Personal information is destroyed securely when its retention period ends."),
  group("P5", "PRIVACY", "Access", "Letting people see and correct their information."),
  criterion("P5.1", "P5", "Access to own data", "People can review the personal information held about them."),
  criterion("P5.2", "P5", "Correction", "People can ask for their personal information to be corrected, and those requests are handled and communicated."),
  group("P6", "PRIVACY", "Disclosure and notification", "Sharing with third parties and handling breaches."),
  criterion("P6.1", "P6", "Third-party disclosure", "Personal information is shared with third parties only for identified purposes and with consent where required."),
  criterion("P6.2", "P6", "Record of authorized disclosures", "Authorized disclosures of personal information are recorded completely and accurately."),
  criterion("P6.3", "P6", "Record of unauthorized disclosures", "Unauthorized disclosures, including breaches, are recorded completely and accurately."),
  criterion("P6.4", "P6", "Third-party commitments", "Vendors that handle personal information commit to appropriate protections, and their compliance is checked."),
  criterion("P6.5", "P6", "Third-party breach reporting", "Vendors must report unauthorized disclosures of personal information they handle."),
  criterion("P6.6", "P6", "Breach notification", "Affected people and other required parties are notified of breaches as commitments and laws require."),
  criterion("P6.7", "P6", "Accounting of disclosures", "People can learn what personal information is held about them and how it has been shared."),
  group("P7", "PRIVACY", "Quality", "Keeping personal information accurate."),
  criterion("P7.1", "P7", "Data quality", "Personal information is kept accurate, complete and relevant for its purposes."),
  group("P8", "PRIVACY", "Monitoring and enforcement", "Handling inquiries, complaints and disputes."),
  criterion("P8.1", "P8", "Inquiries and complaints", "Privacy inquiries, complaints and disputes are received, resolved and tracked, and compliance with privacy commitments is monitored."),
];
