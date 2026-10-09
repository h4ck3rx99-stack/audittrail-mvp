import type { ControlTemplateDefinition } from "../types";

/**
 * The AuditTrail SOC 2 starter control library. Original content: control wording, guidance and
 * evidence requirements are written for small and mid-sized SaaS companies.
 *
 * Coverage rule (enforced by tests/unit/catalog.test.ts): every Security (CC) criterion is mapped
 * by at least one template; A1 and C1 have templates; PI and P intentionally have none, so the
 * framework view honestly shows them as uncovered when they are in scope.
 */
export const SOC2_CONTROL_TEMPLATES: ControlTemplateDefinition[] = [
  // ── Governance (GV) ───────────────────────────────────────────────────────
  {
    code: "GV-01",
    name: "Information security policy approved and published",
    description:
      "A written information security policy sets the organization's security expectations, is approved by leadership and is available to all personnel.",
    guidance:
      "Keep one top-level policy that references topic policies (access, change, incident, data). Record who approved it and when. Publish it where staff actually look, such as the handbook or intranet, and review it at least once a year.",
    domain: "GV",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC5.3", "CC2.2", "CC1.1"],
    evidence: [
      {
        key: "policy",
        title: "Approved information security policy",
        description: "Current policy document showing version, approver and approval date.",
        freshnessDays: 365,
      },
      {
        key: "acknowledgements",
        title: "Policy acknowledgement records",
        description: "Export showing that current personnel acknowledged the policy.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "GV-02",
    name: "Code of conduct acknowledged by personnel",
    description:
      "Personnel acknowledge a code of conduct that covers ethical behavior, conflicts of interest and how to report concerns.",
    guidance:
      "Include the code of conduct in onboarding and collect a signed or electronic acknowledgement. Re-collect acknowledgements annually or when the code changes materially. Explain how to raise concerns anonymously.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.1", "CC1.5"],
    evidence: [
      {
        key: "code",
        title: "Code of conduct",
        description: "Current code of conduct document.",
        freshnessDays: 365,
      },
      {
        key: "acks",
        title: "Code of conduct acknowledgements",
        description: "Acknowledgement records for current personnel.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "GV-03",
    name: "Independent oversight of the security program",
    description:
      "A board, advisory board or other body independent of day-to-day operations reviews the security program at least annually.",
    guidance:
      "At small companies this can be a board meeting agenda item with an outside director or advisor. Present program status, top risks and audit readiness. Keep minutes that record attendees and decisions.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.2"],
    evidence: [
      {
        key: "minutes",
        title: "Minutes of security oversight meeting",
        description: "Meeting minutes showing the security program was reviewed and by whom.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "GV-04",
    name: "Security roles and organizational structure defined",
    description:
      "An organizational chart and documented security roles show who is responsible for the security program and who they report to.",
    guidance:
      "Name an accountable security owner, even if it is a part-time role. Document responsibilities for security, IT and engineering leadership. Update the chart when reporting lines change.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.3"],
    evidence: [
      {
        key: "orgchart",
        title: "Current organizational chart",
        description: "Org chart with reporting lines for teams in scope.",
        freshnessDays: 365,
      },
      {
        key: "roles",
        title: "Security roles and responsibilities",
        description: "Document assigning security responsibilities to named roles.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "GV-05",
    name: "Leadership reviews security program status quarterly",
    description:
      "Leadership reviews control status, open risks, incidents and deficiencies every quarter and assigns follow-up actions.",
    guidance:
      "Use a standing agenda: readiness, overdue controls, open risks, incidents and audit findings. Record decisions and owners. Deficiencies raised here should become tracked tasks.",
    domain: "GV",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC4.2", "CC2.1", "CC1.2"],
    evidence: [
      {
        key: "notes",
        title: "Quarterly leadership security review notes",
        description: "Notes or slides from the most recent quarterly review with action items.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "GV-06",
    name: "System description and data flows documented",
    description:
      "A current description of the system boundary, components, data flows and third parties in scope is maintained.",
    guidance:
      "Draw the production architecture and show where customer data enters, is stored and leaves. List subservice organizations such as the cloud provider. Revisit it whenever the architecture changes significantly.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC2.1", "CC3.1"],
    evidence: [
      {
        key: "description",
        title: "System description and data flow diagram",
        description: "Architecture and data flow diagram with a short narrative.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "GV-07",
    name: "Security commitments communicated to customers",
    description:
      "Security commitments, contact points and a vulnerability disclosure process are published for customers and outside parties.",
    guidance:
      "Publish a security page or trust page describing your key practices and a contact address. Make sure customer agreements reflect the commitments you can keep. Provide a way for researchers to report vulnerabilities.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC2.3"],
    evidence: [
      {
        key: "page",
        title: "Published security commitments",
        description: "Screenshot or copy of the public security page.",
        freshnessDays: 365,
      },
      {
        key: "terms",
        title: "Customer agreement security terms",
        description: "Standard contract or DPA language describing security commitments.",
        freshnessDays: 365,
      },
    ],
  },

  // ── People (HR) ───────────────────────────────────────────────────────────
  {
    code: "HR-01",
    name: "Background checks for new hires",
    description:
      "Background checks are completed for new employees and contractors with access to production or customer data, where lawful.",
    guidance:
      "Define which roles require checks and run them before access is granted. Keep completion evidence, not the report contents. Follow local law on what may be checked.",
    domain: "HR",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.4", "CC1.1"],
    evidence: [
      {
        key: "checks",
        title: "Background check completion records",
        description: "Completion status for a sample of hires from the period.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "HR-02",
    name: "Security awareness training at hire and annually",
    description:
      "All personnel complete security awareness training when they join and at least once a year after that.",
    guidance:
      "Cover phishing, password and MFA hygiene, data handling and how to report incidents. Track completion per person and follow up with anyone overdue. Keep the training material itself as evidence too.",
    domain: "HR",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.4", "CC2.2"],
    evidence: [
      {
        key: "completion",
        title: "Training completion report",
        description: "Report showing completion status for all current personnel.",
        freshnessDays: 365,
      },
      {
        key: "content",
        title: "Training content",
        description: "Slides, course outline or LMS listing of the training delivered.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "HR-03",
    name: "Performance reviews hold people accountable",
    description:
      "Regular performance reviews evaluate personnel against their responsibilities, including security and policy adherence.",
    guidance:
      "Run reviews at least annually and record completion. Include adherence to security policies where relevant. Link repeated policy violations to the disciplinary process.",
    domain: "HR",
    priority: "LOW",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC1.5"],
    evidence: [
      {
        key: "reviews",
        title: "Performance review completion records",
        description: "Completion status of the most recent review cycle.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "HR-04",
    name: "Access removed promptly at offboarding",
    description:
      "When personnel leave or change roles, their access to systems and data is removed within a defined timeframe.",
    guidance:
      "Trigger offboarding from the HR system and track it as a ticket with a checklist per system. Aim for same-day removal of identity provider access. Recover company devices and confirm completion.",
    domain: "HR",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.2", "CC6.3"],
    evidence: [
      {
        key: "tickets",
        title: "Offboarding records with access removal",
        description: "Sample of offboarding tickets showing access removal dates.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "HR-05",
    name: "Confidentiality agreements signed",
    description:
      "Employees and contractors sign confidentiality agreements before receiving access to confidential information.",
    guidance:
      "Include confidentiality terms in employment and contractor agreements. Store signed copies in the HR system. Contractors should not receive access until the agreement is signed.",
    domain: "HR",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["C1.1", "CC1.1"],
    evidence: [
      {
        key: "ndas",
        title: "Signed confidentiality agreements",
        description: "Sample of signed agreements for personnel hired during the period.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Risk Management (RM) ──────────────────────────────────────────────────
  {
    code: "RM-01",
    name: "Annual risk assessment",
    description:
      "A formal risk assessment identifies threats to objectives, rates likelihood and impact, and decides how each risk is treated.",
    guidance:
      "Run the assessment at least annually and after major changes. Use a consistent scoring method and record the treatment decision for each risk. Have leadership review and sign off on the results.",
    domain: "RM",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC3.1", "CC3.2", "CC3.4"],
    evidence: [
      {
        key: "assessment",
        title: "Completed risk assessment",
        description: "Risk assessment report with scoring and leadership sign-off.",
        freshnessDays: 365,
      },
      {
        key: "register",
        title: "Risk register export",
        description: "Current risk register with owners and treatment status.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "RM-02",
    name: "Fraud risk considered in risk assessment",
    description:
      "The risk assessment explicitly considers fraud, including management override, misuse of access and incentives to misreport.",
    guidance:
      "Add a fraud section to the risk assessment covering financial, data and access-related fraud scenarios. Note which controls address each one.",
    domain: "RM",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC3.3"],
    evidence: [
      {
        key: "fraud",
        title: "Fraud risk analysis",
        description: "Section of the risk assessment covering fraud scenarios and responses.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "RM-03",
    name: "Risk treatment plans tracked to completion",
    description:
      "Each risk that is not accepted has a treatment plan with an owner and due date, tracked until it is complete.",
    guidance:
      "Track treatments as tasks linked to the risk. Review overdue treatments in the quarterly leadership review. Document the rationale and approver for accepted risks.",
    domain: "RM",
    priority: "MEDIUM",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC3.2", "CC5.1", "CC9.1"],
    evidence: [
      {
        key: "status",
        title: "Risk treatment status report",
        description: "Status of open treatment plans with owners and due dates.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "RM-04",
    name: "Significant changes assessed for risk",
    description:
      "Significant changes, such as new products, vendors, acquisitions or leadership changes, are assessed for their effect on controls.",
    guidance:
      "Define what counts as significant. Add a short risk review step to the approval of those changes and record the outcome in the risk register.",
    domain: "RM",
    priority: "MEDIUM",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC3.4"],
    evidence: [
      {
        key: "reviews",
        title: "Change risk assessments",
        description: "Records of risk reviews performed for significant changes in the period.",
        freshnessDays: 180,
      },
    ],
  },

  // ── Access Control (AC) ───────────────────────────────────────────────────
  {
    code: "AC-01",
    name: "Multi-factor authentication enforced",
    description:
      "Multi-factor authentication is required for all workforce access to the identity provider, production systems and critical SaaS tools.",
    guidance:
      "Enforce MFA centrally in the identity provider rather than per application. Prefer phishing-resistant factors such as security keys or platform authenticators. Alert on any account without MFA enrolled.",
    domain: "AC",
    priority: "CRITICAL",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.1", "CC6.2"],
    evidence: [
      {
        key: "setting",
        title: "Identity provider MFA enforcement setting",
        description: "Screenshot or export showing MFA is required for all users.",
        freshnessDays: 365,
      },
      {
        key: "users",
        title: "User list showing MFA status",
        description: "Export of active users and their MFA enrollment.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "AC-02",
    name: "Centralized identity with unique accounts",
    description:
      "Workforce access goes through a central identity provider with one unique account per person; shared accounts are not used.",
    guidance:
      "Connect critical applications to SSO. Where SSO is not available, keep an inventory of local accounts and include them in access reviews. Shared credentials, if unavoidable, live in a managed vault with an owner.",
    domain: "AC",
    priority: "HIGH",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC6.1", "CC6.2"],
    evidence: [
      {
        key: "apps",
        title: "Identity provider application list",
        description: "List of applications connected to the identity provider.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "AC-03",
    name: "Quarterly user access reviews",
    description:
      "Access to production systems and critical applications is reviewed every quarter, and inappropriate access is removed.",
    guidance:
      "Export current users and roles per system and have the system owner confirm each one. Record who reviewed, when, and what was changed. Remove access within a few days of the review.",
    domain: "AC",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.2", "CC6.3", "CC6.4"],
    evidence: [
      {
        key: "review",
        title: "Completed access review with sign-off",
        description: "Review spreadsheet or report with reviewer sign-off and resulting changes.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "AC-04",
    name: "Least-privilege, role-based production access",
    description:
      "Production access is granted through defined roles based on job need, and standing administrative access is minimized.",
    guidance:
      "Define production roles and who may hold them. Prefer just-in-time elevation for administrative actions. Keep the list of people with production access short and current.",
    domain: "AC",
    priority: "CRITICAL",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.3", "CC5.2", "CC6.1"],
    evidence: [
      {
        key: "roles",
        title: "Production access role definitions",
        description: "Description of production roles and their permissions.",
        freshnessDays: 365,
      },
      {
        key: "users",
        title: "Users with production access",
        description: "Current list of people with production access and their roles.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "AC-05",
    name: "Privileged access restricted and logged",
    description:
      "Administrative accounts on infrastructure and identity systems are limited, separate from daily accounts where feasible, and their use is logged.",
    guidance:
      "Limit cloud and identity administrators to a few named people. Turn on administrative activity logging and keep the logs for at least a year. Review the admin list quarterly.",
    domain: "AC",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.3", "CC6.1"],
    evidence: [
      {
        key: "admins",
        title: "Administrator account list",
        description: "Current administrators for cloud and identity platforms.",
        freshnessDays: 90,
      },
      {
        key: "logging",
        title: "Administrative activity logging configuration",
        description: "Configuration showing admin activity logs are enabled and retained.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "AC-06",
    name: "Office physical access restricted",
    description:
      "Physical access to offices is limited to authorized people through badges or keys, and visitors are escorted.",
    guidance:
      "Issue badges per person and deactivate them at offboarding. Keep a visitor log. Fully remote companies can mark this control not applicable with a justification.",
    domain: "AC",
    priority: "LOW",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC6.4"],
    evidence: [
      {
        key: "badges",
        title: "Office access list",
        description: "Current list of active badges or key holders.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "AC-07",
    name: "Data center security inherited from cloud provider",
    description:
      "Physical security and media disposal for production infrastructure are provided by the cloud provider, whose controls are reviewed annually.",
    guidance:
      "Obtain the provider's SOC 2 report each year, review the opinion and exceptions, and confirm the complementary user entity controls you are responsible for. Record the review.",
    domain: "AC",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC6.4", "CC6.5"],
    evidence: [
      {
        key: "review",
        title: "Cloud provider SOC 2 report review",
        description: "Notes from the annual review of the provider's attestation report.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "AC-08",
    name: "Endpoints managed and protected",
    description:
      "Company laptops are centrally managed with disk encryption, screen lock, automatic updates and malware protection.",
    guidance:
      "Enroll every device in mobile device management and enforce encryption, screen lock and OS updates. Deploy endpoint protection and alert on devices that fall out of compliance.",
    domain: "AC",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.7", "CC6.8"],
    evidence: [
      {
        key: "mdm",
        title: "Device compliance report",
        description: "MDM export showing encryption, screen lock and protection status per device.",
        freshnessDays: 90,
      },
    ],
  },

  // ── Infrastructure and Network (IN) ───────────────────────────────────────
  {
    code: "IN-01",
    name: "Network access to production restricted",
    description:
      "Firewalls and security groups allow only required inbound traffic to production, and administrative ports are not exposed to the internet.",
    guidance:
      "Default to deny inbound. Expose only load balancer ports publicly and reach internal services through a VPN or bastion with MFA. Review rules when infrastructure changes.",
    domain: "IN",
    priority: "CRITICAL",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC6.6", "CC6.1"],
    evidence: [
      {
        key: "rules",
        title: "Firewall and security group configuration",
        description: "Export of inbound rules for production.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "IN-02",
    name: "Data encrypted in transit",
    description:
      "Customer data is encrypted in transit with current TLS versions on all external endpoints and internal service connections that cross networks.",
    guidance:
      "Disable TLS versions older than 1.2. Enable HSTS on web endpoints. Run an external TLS scan after certificate or load balancer changes.",
    domain: "IN",
    priority: "HIGH",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC6.7", "CC6.1"],
    evidence: [
      {
        key: "scan",
        title: "TLS configuration scan",
        description: "External scan showing protocol versions and certificate status.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "IN-03",
    name: "Data encrypted at rest",
    description:
      "Databases, object storage, backups and volumes that hold customer data are encrypted at rest.",
    guidance:
      "Enable provider-managed encryption on every data store and make it the default for new resources. Check new resources in infrastructure reviews.",
    domain: "IN",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC6.1", "C1.1"],
    evidence: [
      {
        key: "settings",
        title: "Storage encryption settings",
        description: "Configuration showing encryption at rest for each data store.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "IN-04",
    name: "Infrastructure defined as code with secure baselines",
    description:
      "Production infrastructure is defined in version-controlled code with hardened baseline configurations.",
    guidance:
      "Manage infrastructure with an IaC tool and require review for changes. Keep hardened images or baseline modules. Investigate manual changes made outside of code.",
    domain: "IN",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC7.1", "CC5.2"],
    evidence: [
      {
        key: "iac",
        title: "Infrastructure-as-code repository",
        description: "Link or export showing infrastructure definitions and baseline modules.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "IN-05",
    name: "Production separated from other environments",
    description:
      "Production runs in a separate account or network from development and testing, and production data is not used outside production.",
    guidance:
      "Use separate cloud accounts or projects per environment. Block network paths from non-production into production. Use synthetic or masked data for testing.",
    domain: "IN",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC6.6", "CC6.1"],
    evidence: [
      {
        key: "diagram",
        title: "Network architecture diagram",
        description: "Diagram showing environment separation.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Change Management (CM) ────────────────────────────────────────────────
  {
    code: "CM-01",
    name: "Peer review required before production changes",
    description:
      "Code changes require approval from someone other than the author before they can be merged and deployed to production.",
    guidance:
      "Enable branch protection on the default branch: required reviews, no self-approval, no force pushes. Limit who can bypass protection and log any bypass.",
    domain: "CM",
    priority: "CRITICAL",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC8.1"],
    evidence: [
      {
        key: "protection",
        title: "Branch protection configuration",
        description: "Repository settings showing required reviews and restrictions.",
        freshnessDays: 365,
      },
      {
        key: "sample",
        title: "Sample of merged changes with approvals",
        description: "A sample of pull requests from the period with approver and merge details.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "CM-02",
    name: "Automated tests run before deployment",
    description:
      "A continuous integration pipeline runs automated tests and checks, and failing builds cannot be deployed.",
    guidance:
      "Make CI status a required check on protected branches. Deploy only from the CI pipeline, never from laptops. Keep CI logs long enough to cover the audit period.",
    domain: "CM",
    priority: "HIGH",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC8.1", "CC7.1"],
    evidence: [
      {
        key: "pipeline",
        title: "CI pipeline configuration",
        description: "Pipeline definition showing tests and required checks.",
        freshnessDays: 365,
      },
      {
        key: "runs",
        title: "Sample CI run results",
        description: "Recent pipeline runs including at least one blocked failing build.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "CM-03",
    name: "Emergency changes reviewed after the fact",
    description:
      "Emergency changes that bypass normal review are documented and reviewed retrospectively within a defined window.",
    guidance:
      "Define what qualifies as an emergency and who may approve one. Log every emergency change and complete a review within two business days.",
    domain: "CM",
    priority: "MEDIUM",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC8.1"],
    evidence: [
      {
        key: "procedure",
        title: "Emergency change procedure",
        description: "Documented emergency change process.",
        freshnessDays: 365,
      },
      {
        key: "log",
        title: "Emergency change log",
        description: "Log of emergency changes and their retrospective reviews.",
        freshnessDays: 180,
        isRequired: false,
      },
    ],
  },

  // ── Operations and Monitoring (OP) ────────────────────────────────────────
  {
    code: "OP-01",
    name: "Centralized logging and security alerting",
    description:
      "Logs from production systems and identity providers are centralized, retained and monitored with alerts for suspicious activity.",
    guidance:
      "Send application, infrastructure and identity logs to one place and retain them for at least a year. Alert on events such as admin role grants, disabled logging and unusual sign-ins. Route alerts to an on-call owner.",
    domain: "OP",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC7.2", "CC7.3"],
    evidence: [
      {
        key: "logging",
        title: "Logging configuration and retention",
        description: "Configuration showing log sources and retention period.",
        freshnessDays: 180,
      },
      {
        key: "alerts",
        title: "Security alert rules",
        description: "List of active alert rules and their destinations.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "OP-02",
    name: "Availability and capacity monitored",
    description:
      "Uptime, latency and resource usage are monitored against thresholds, and capacity is reviewed before limits are reached.",
    guidance:
      "Monitor availability from outside your network and alert on breaches of your targets. Review capacity trends at least twice a year and record any scaling decisions.",
    domain: "OP",
    priority: "MEDIUM",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["A1.1", "CC7.2"],
    evidence: [
      {
        key: "dashboard",
        title: "Availability monitoring dashboard",
        description: "Screenshot of uptime and resource monitoring.",
        freshnessDays: 90,
      },
      {
        key: "capacity",
        title: "Capacity review record",
        description: "Notes from the most recent capacity review.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "OP-03",
    name: "Configuration drift detected",
    description:
      "Changes to cloud configuration are detected and compared against approved baselines, and risky changes raise alerts.",
    guidance:
      "Enable the cloud provider's configuration recording or a posture management tool. Alert on public storage, disabled encryption and opened administrative ports.",
    domain: "OP",
    priority: "MEDIUM",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC7.1"],
    evidence: [
      {
        key: "findings",
        title: "Configuration monitoring findings",
        description: "Recent findings report and how they were resolved.",
        freshnessDays: 90,
      },
    ],
  },

  // ── Vulnerability Management (VM) ─────────────────────────────────────────
  {
    code: "VM-01",
    name: "Vulnerability scanning of infrastructure",
    description:
      "Infrastructure and container images are scanned for vulnerabilities at least monthly, and findings are remediated within defined timeframes.",
    guidance:
      "Scan continuously where the tooling allows. Set remediation timeframes by severity, for example 7 days for critical and 30 for high. Track exceptions with an owner and expiry.",
    domain: "VM",
    priority: "HIGH",
    reviewFrequency: "MONTHLY",
    requirementCodes: ["CC7.1", "CC6.8"],
    evidence: [
      {
        key: "scan",
        title: "Vulnerability scan report",
        description: "Most recent scan results with open findings by severity.",
        freshnessDays: 45,
      },
    ],
  },
  {
    code: "VM-02",
    name: "Annual penetration test",
    description:
      "An independent party performs a penetration test of the application and infrastructure at least annually, and findings are remediated.",
    guidance:
      "Scope the test to the production application and external attack surface. Track every finding to closure and retest the high-severity ones. Keep the report and remediation evidence together.",
    domain: "VM",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC4.1", "CC7.1"],
    evidence: [
      {
        key: "report",
        title: "Penetration test report",
        description: "Report from the most recent independent penetration test.",
        freshnessDays: 365,
      },
      {
        key: "remediation",
        title: "Penetration test remediation tracking",
        description: "Status of each finding with fix dates.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "VM-03",
    name: "Security patches applied on schedule",
    description:
      "Operating system and platform security patches are applied within defined timeframes based on severity.",
    guidance:
      "Prefer managed services and automatic patching. For self-managed hosts, rebuild from patched images regularly. Report patch compliance monthly.",
    domain: "VM",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC7.1", "CC6.8"],
    evidence: [
      {
        key: "compliance",
        title: "Patch compliance report",
        description: "Report showing patch status for production systems.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "VM-04",
    name: "Dependencies scanned for known vulnerabilities",
    description:
      "Application dependencies are scanned automatically, and vulnerable packages are upgraded within defined timeframes.",
    guidance:
      "Enable dependency scanning in the repository or CI. Fail builds on critical vulnerabilities with available fixes. Review open alerts weekly.",
    domain: "VM",
    priority: "MEDIUM",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC7.1", "CC8.1"],
    evidence: [
      {
        key: "config",
        title: "Dependency scanning configuration",
        description: "Configuration showing automated dependency scanning.",
        freshnessDays: 365,
      },
      {
        key: "alerts",
        title: "Open dependency alerts",
        description: "Export of open dependency alerts and their age.",
        freshnessDays: 90,
        isRequired: false,
      },
    ],
  },

  // ── Incident Response (IR) ────────────────────────────────────────────────
  {
    code: "IR-01",
    name: "Incident response plan documented",
    description:
      "A documented plan defines how security incidents are reported, triaged, escalated, contained, communicated and closed.",
    guidance:
      "Define severity levels, roles and contact paths, including after hours. Include customer and regulator notification steps. Make the plan easy to find during an incident.",
    domain: "IR",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC7.3", "CC7.4"],
    evidence: [
      {
        key: "plan",
        title: "Incident response plan",
        description: "Current incident response plan with version and approval.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "IR-02",
    name: "Incident response plan tested annually",
    description:
      "The incident response plan is exercised at least annually through a tabletop or simulation, and lessons learned are applied.",
    guidance:
      "Run a realistic scenario such as a leaked credential or ransomware with the people who would respond. Record gaps found and track them as tasks. Update the plan afterwards.",
    domain: "IR",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC7.3", "CC7.4", "CC7.5"],
    evidence: [
      {
        key: "exercise",
        title: "Tabletop exercise report",
        description: "Scenario, participants, findings and follow-up actions.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "IR-03",
    name: "Incidents tracked with post-incident reviews",
    description:
      "Security incidents are logged, tracked to resolution and followed by a review that identifies root causes and improvements.",
    guidance:
      "Keep an incident log even when there were no incidents. Hold blameless reviews for significant incidents and link resulting improvements to tasks.",
    domain: "IR",
    priority: "MEDIUM",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC7.4", "CC7.5", "CC4.2"],
    evidence: [
      {
        key: "log",
        title: "Incident log",
        description: "Log of incidents in the period with status and severity.",
        freshnessDays: 90,
      },
      {
        key: "review",
        title: "Post-incident review",
        description: "Most recent post-incident review document.",
        freshnessDays: 365,
        isRequired: false,
      },
    ],
  },
  {
    code: "IR-04",
    name: "Breach notification procedure",
    description:
      "A procedure defines how and when customers and authorities are notified of incidents that affect their data.",
    guidance:
      "Capture contractual and legal notification deadlines. Prepare notification templates and name who approves external communication.",
    domain: "IR",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC7.4", "CC2.3"],
    evidence: [
      {
        key: "procedure",
        title: "Customer notification procedure",
        description: "Documented notification procedure with timelines.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Business Continuity (BC) ──────────────────────────────────────────────
  {
    code: "BC-01",
    name: "Backups performed and restores tested",
    description:
      "Production data is backed up automatically, backups are retained and protected, and restores are tested on a regular schedule.",
    guidance:
      "Use automated, encrypted backups with point-in-time recovery for databases. Store copies in a separate account or region. Test a restore at least quarterly and record the time it took.",
    domain: "BC",
    priority: "CRITICAL",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["A1.2", "A1.3"],
    evidence: [
      {
        key: "config",
        title: "Backup configuration",
        description: "Configuration showing backup frequency, retention and encryption.",
        freshnessDays: 365,
      },
      {
        key: "restore",
        title: "Restore test record",
        description: "Record of the most recent restore test and its result.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "BC-02",
    name: "Business continuity and disaster recovery plan",
    description:
      "A plan defines recovery objectives and the steps to keep or restore critical services during a disruption.",
    guidance:
      "Set recovery time and recovery point objectives for critical services. Document failover steps and dependencies such as DNS and secrets. Review the plan annually.",
    domain: "BC",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC9.1", "A1.2"],
    evidence: [
      {
        key: "plan",
        title: "Business continuity and disaster recovery plan",
        description: "Current plan with recovery objectives.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "BC-03",
    name: "Disaster recovery tested annually",
    description:
      "Disaster recovery procedures are exercised at least annually to confirm recovery objectives can be met.",
    guidance:
      "Simulate the loss of a region or a critical dependency. Measure actual recovery time against the objective and record gaps as tasks.",
    domain: "BC",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["A1.3", "CC7.5"],
    evidence: [
      {
        key: "test",
        title: "Disaster recovery test report",
        description: "Report of the most recent DR test with measured results.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Data Protection and Confidentiality (DP) ──────────────────────────────
  {
    code: "DP-01",
    name: "Data classification policy",
    description:
      "Information is classified by sensitivity, and handling requirements are defined for each class.",
    guidance:
      "Keep the scheme simple, for example public, internal, confidential and customer data. Map key systems to the highest class they store. Train staff on handling rules.",
    domain: "DP",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["C1.1", "CC2.1"],
    evidence: [
      {
        key: "policy",
        title: "Data classification policy",
        description: "Current classification policy with handling rules.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "DP-02",
    name: "Data retention and secure disposal",
    description:
      "Retention periods are defined, and data and media are securely disposed of when their retention period ends.",
    guidance:
      "Document retention per data type and automate deletion where possible. Wipe or destroy devices before disposal and keep certificates of destruction.",
    domain: "DP",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["C1.2", "CC6.5"],
    evidence: [
      {
        key: "schedule",
        title: "Retention schedule",
        description: "Retention periods per data type.",
        freshnessDays: 365,
      },
      {
        key: "disposal",
        title: "Disposal records",
        description: "Deletion job logs or device destruction certificates from the period.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "DP-03",
    name: "Encryption keys managed securely",
    description:
      "Encryption keys and application secrets are stored in a managed key or secret service with restricted access and rotation.",
    guidance:
      "Never commit secrets to source control; scan for them in CI. Restrict who can read production secrets and rotate them when people with access leave.",
    domain: "DP",
    priority: "HIGH",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC6.1", "C1.1"],
    evidence: [
      {
        key: "config",
        title: "Key and secret management configuration",
        description:
          "Configuration of the key management or secrets service and its access policy.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Vendor Management (VN) ────────────────────────────────────────────────
  {
    code: "VN-01",
    name: "Vendors assessed before onboarding",
    description:
      "Vendors that will access systems or data are assessed for security risk before they are engaged.",
    guidance:
      "Tier vendors by the data they access. For high-risk vendors, review their security reports or questionnaires before signing. Record the decision and any conditions.",
    domain: "VN",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC9.2"],
    evidence: [
      {
        key: "assessment",
        title: "Vendor risk assessment",
        description: "Assessment record for a vendor onboarded during the period.",
        freshnessDays: 365,
      },
      {
        key: "inventory",
        title: "Vendor inventory",
        description: "List of vendors with risk tier and data access.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "VN-02",
    name: "Critical vendors reviewed annually",
    description:
      "Security attestations of critical vendors are reviewed at least annually and any concerns are followed up.",
    guidance:
      "Collect current SOC 2 or ISO 27001 reports from critical vendors. Note exceptions and the complementary controls you must operate.",
    domain: "VN",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC9.2", "CC4.1"],
    evidence: [
      {
        key: "reviews",
        title: "Critical vendor report reviews",
        description: "Review notes for each critical vendor's attestation report.",
        freshnessDays: 365,
      },
    ],
  },
  {
    code: "VN-03",
    name: "Vendor agreements include security terms",
    description:
      "Contracts with vendors that handle confidential data include security, confidentiality and breach notification obligations.",
    guidance:
      "Use a standard data processing agreement or security addendum. Check that breach notification timelines meet your own commitments to customers.",
    domain: "VN",
    priority: "LOW",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC9.2", "C1.1"],
    evidence: [
      {
        key: "agreement",
        title: "Vendor security agreement",
        description: "Sample data processing agreement or security addendum.",
        freshnessDays: 365,
      },
    ],
  },

  // ── Additional controls ───────────────────────────────────────────────────
  {
    code: "AC-09",
    name: "Customer data access by personnel is controlled",
    description:
      "Personnel access to customer data in production is limited to approved support and engineering needs and is logged.",
    guidance:
      "Require a ticket or customer consent for support access to customer data. Log access to customer records and review the log periodically.",
    domain: "AC",
    priority: "HIGH",
    reviewFrequency: "QUARTERLY",
    requirementCodes: ["CC6.3", "C1.1"],
    evidence: [
      {
        key: "procedure",
        title: "Customer data access procedure",
        description: "Procedure describing when and how staff may access customer data.",
        freshnessDays: 365,
      },
      {
        key: "log",
        title: "Customer data access log review",
        description: "Most recent review of support access logs.",
        freshnessDays: 90,
      },
    ],
  },
  {
    code: "OP-04",
    name: "Asset inventory maintained",
    description:
      "An inventory of production systems, devices and critical SaaS applications is maintained with owners.",
    guidance:
      "Generate the inventory from your cloud provider, MDM and identity provider rather than by hand. Assign an owner to each critical asset.",
    domain: "OP",
    priority: "MEDIUM",
    reviewFrequency: "SEMI_ANNUALLY",
    requirementCodes: ["CC6.1", "CC3.2"],
    evidence: [
      {
        key: "inventory",
        title: "Asset inventory export",
        description: "Current inventory of systems, devices and applications with owners.",
        freshnessDays: 180,
      },
    ],
  },
  {
    code: "GV-08",
    name: "Policies reviewed and approved annually",
    description:
      "All security policies are reviewed, updated where needed and re-approved at least once a year.",
    guidance:
      "Keep a policy index with owner, last review date and next review date. Record approval for each policy and communicate material changes to staff.",
    domain: "GV",
    priority: "MEDIUM",
    reviewFrequency: "ANNUALLY",
    requirementCodes: ["CC5.3", "CC5.1"],
    evidence: [
      {
        key: "index",
        title: "Policy index with review dates",
        description: "List of policies with owners and approval dates.",
        freshnessDays: 365,
      },
    ],
  },
];
