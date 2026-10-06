// AuditTrail demo seed.
//
// Rules:
// - Runs `catalog:sync` first.
// - Every demo mutation goes through the real service layer, performed as the relevant demo user,
//   with metadata.seed = true on every audit event. No audit event is fabricated or backdated.
// - Domain dates (due dates, collected/valid-until dates, review dates) are set relative to "today"
//   so realistic states exist. They are data fields, not history.
// - Refuses to run when DEPLOYMENT_ENV=production unless ALLOW_DEMO_SEED=true.
//
// Usage: npm run db:seed   (or npm run db:reset to drop, migrate and seed)
import "dotenv/config";
import { env, isProductionDeployment } from "@/env";
import { db } from "@/server/db";
import { syncCatalog } from "@/server/frameworks/catalog-sync";
import { signUp } from "@/server/auth/service";
import type { OrgContext, SessionUser, UserContext } from "@/server/context";
import { systemRequestMeta } from "@/server/request-meta";
import { createOrganization } from "@/features/organizations/server/service";
import { adoptFramework } from "@/features/frameworks/server/service";
import { acceptInvitation, createInvitation } from "@/features/members/server/service";
import { bulkAssignOwner, bulkChangeStatus, createControl, recordControlReview, setNextReviewDate } from "@/features/controls/server/service";
import { createLinkEvidence, reviewEvidence, uploadEvidenceFile } from "@/features/evidence/server/service";
import { changeTaskStatus, createTask } from "@/features/tasks/server/service";
import { changeRiskStatus, createRisk } from "@/features/risks/server/service";
import { loadGaps } from "@/features/readiness/server/snapshot";
import { loadOrgContext } from "@/server/authz/context";
import { runComplianceScan } from "@/server/jobs/compliance-scan";
import { addDays, addMonths, todayInTimeZone } from "@/lib/dates";
import { demoCsv, demoPdf, demoPng, demoText } from "./seed-files";

export const DEMO_PASSWORD = "northwind-demo-2026";
const SEED_META = { seed: true } as const;

const PEOPLE = {
  olivia: { name: "Olivia Chen", email: "olivia@northwind.example", title: "Founder & CEO" },
  marcus: { name: "Marcus Reed", email: "marcus@northwind.example", title: "Security Lead" },
  priya: { name: "Priya Natarajan", email: "priya@northwind.example", title: "Engineering Lead" },
  sam: { name: "Sam Okafor", email: "sam@northwind.example", title: "People Operations" },
  dana: { name: "Dana Whitfield", email: "dana@auditor.example", title: "External Auditor" },
  elena: { name: "Elena Varga", email: "elena@contoso.example", title: "Founder" },
} as const;
type Person = keyof typeof PEOPLE;

function log(message: string) {
  console.log(`[seed] ${message}`);
}

async function userCtx(user: SessionUser): Promise<UserContext> {
  return { user, request: systemRequestMeta("audittrail-seed"), sessionId: null, auditMetadata: SEED_META };
}

async function orgCtx(user: SessionUser, slug: string): Promise<OrgContext> {
  const ctx = await loadOrgContext(user, slug, systemRequestMeta("audittrail-seed"), null);
  if (!ctx) throw new Error(`${user.email} is not a member of ${slug}`);
  return { ...ctx, auditMetadata: SEED_META };
}

async function main() {
  if (isProductionDeployment && !env.ALLOW_DEMO_SEED) {
    console.error("Refusing to seed demo data: DEPLOYMENT_ENV=production and ALLOW_DEMO_SEED is not true.");
    process.exitCode = 1;
    return;
  }

  for (const r of await syncCatalog()) log(`catalog synced: ${r.framework} (${r.controlTemplates} control templates)`);

  if (await db.organization.findUnique({ where: { slug: "northwind-labs" } })) {
    log("Demo data already present (northwind-labs exists). Run `npm run db:reset` for a fresh seed.");
    return;
  }

  // ── Users (real sign-up flow) ───────────────────────────────────────────────
  const users = {} as Record<Person, SessionUser>;
  for (const [key, p] of Object.entries(PEOPLE) as [Person, (typeof PEOPLE)[Person]][]) {
    // The seed runs from one machine; clear sign-up rate-limit counters between demo accounts.
    await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "signupPerIp:" } } });
    const { user } = await signUp({ name: p.name, email: p.email, password: DEMO_PASSWORD }, { ...systemRequestMeta("audittrail-seed"), ip: null });
    users[key] = user;
  }
  log(`created ${Object.keys(users).length} demo users`);

  // ── Northwind Labs ─────────────────────────────────────────────────────────
  const tz = "America/New_York";
  const today = todayInTimeZone(tz);
  await createOrganization(
    await userCtx(users.olivia),
    {
      name: "Northwind Labs",
      slug: "northwind-labs",
      industry: "B2B SaaS · workflow automation",
      employeeRange: "R11_50",
      description: "Workflow automation platform for mid-market finance teams. About 45 employees. (Fictional demo company.)",
      frameworkKey: "soc2",
      scopeCodes: ["SECURITY", "AVAILABILITY", "CONFIDENTIALITY"],
      starter: true,
      timezone: tz,
      auditType: "TYPE_2",
      targetAuditDate: addMonths(today, 4),
      observationStart: addMonths(today, -2),
      observationEnd: addMonths(today, 3),
    },
    { isDemo: true },
  );
  const slug = "northwind-labs";
  const olivia = await orgCtx(users.olivia, slug);
  log("created Northwind Labs and adopted SOC 2 with the starter control set");

  // Members join through real invitations.
  const invites: [Person, "ADMIN" | "MEMBER" | "VIEWER"][] = [
    ["marcus", "ADMIN"],
    ["priya", "MEMBER"],
    ["sam", "MEMBER"],
    ["dana", "VIEWER"],
  ];
  for (const [person, role] of invites) {
    const { link } = await createInvitation(olivia, { email: PEOPLE[person].email, role });
    await acceptInvitation(await userCtx(users[person]), link.split("/").pop());
  }
  const marcus = await orgCtx(users.marcus, slug);
  const priya = await orgCtx(users.priya, slug);
  const sam = await orgCtx(users.sam, slug);
  log("invited and accepted 4 members");

  const controls = await db.control.findMany({ where: { organization: { slug } }, orderBy: { code: "asc" }, include: { evidenceRequirements: { orderBy: { sortOrder: "asc" } } } });
  const byCode = new Map(controls.map((c) => [c.code, c]));
  const ids = (codes: string[]) => codes.map((c) => byCode.get(c)!.id);

  // ── Ownership (several left unassigned on purpose) ──────────────────────────
  const unassigned = new Set(["GV-07", "RM-04", "VN-03", "DP-03", "OP-04", "IR-04"]);
  const ownerFor = (code: string): Person => {
    const domain = code.split("-")[0]!;
    if (domain === "HR") return "sam";
    if (["GV", "RM", "VN"].includes(domain)) return "marcus";
    return "priya";
  };
  for (const person of ["marcus", "priya", "sam"] as const) {
    const codes = controls.map((c) => c.code).filter((code) => !unassigned.has(code) && ownerFor(code) === person);
    await bulkAssignOwner(marcus, { controlIds: ids(codes), ownerId: users[person].id });
  }
  log("assigned control owners");

  // ── Statuses: ~55% implemented, ~25% in progress, ~15% not started, 3 not applicable ──
  const notApplicable: [string, string][] = [
    ["AC-06", "Northwind Labs is fully remote and has no office; physical access is inherited from the cloud provider (AC-07)."],
    ["CM-03", "Superseded by CM-02: every change is tested in CI against an ephemeral environment before deployment."],
  ];
  const notStarted = ["GV-03", "GV-07", "RM-02", "RM-04", "VN-03", "BC-03", "DP-03", "OP-04"];
  const inProgress = ["GV-06", "HR-01", "HR-04", "RM-03", "AC-02", "AC-05", "IN-04", "IN-05", "OP-03", "VM-02", "VM-04", "IR-02", "IR-04", "DP-02"];
  const implemented = controls.map((c) => c.code).filter((code) => !notStarted.includes(code) && !inProgress.includes(code) && !notApplicable.some(([c]) => c === code));
  await bulkChangeStatus(marcus, { controlIds: ids(inProgress), status: "IN_PROGRESS" });
  await bulkChangeStatus(marcus, { controlIds: ids(implemented), status: "IMPLEMENTED" });
  for (const [code, reason] of notApplicable) {
    await bulkChangeStatus(marcus, { controlIds: ids([code]), status: "NOT_APPLICABLE", notApplicableReason: reason });
  }
  log(`statuses: ${implemented.length} implemented, ${inProgress.length} in progress, ${notStarted.length} not started, ${notApplicable.length} not applicable`);

  // ── Evidence ───────────────────────────────────────────────────────────────
  const ctxFor: Record<Person, OrgContext | null> = { olivia, marcus, priya, sam, dana: null, elena: null };
  type Plan = {
    title: string;
    category: "POLICY" | "SCREENSHOT" | "CONFIGURATION" | "REPORT" | "LOG" | "RECORD" | "OTHER";
    file: "pdf" | "png" | "csv" | "txt";
    targets: [code: string, requirementIndex: number][];
    uploader: Person;
    collectedDaysAgo: number;
    outcome: "approve" | "pending" | "reject" | "expired" | "expiring";
    validInDays?: number;
    comment?: string;
  };
  const plans: Plan[] = [
    { title: "Information Security Policy v3.2", category: "POLICY", file: "pdf", targets: [["GV-01", 0], ["GV-08", 0], ["DP-01", 0]], uploader: "marcus", collectedDaysAgo: 40, outcome: "approve" },
    { title: "Policy acknowledgement export", category: "RECORD", file: "csv", targets: [["GV-01", 1]], uploader: "sam", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Code of Conduct", category: "POLICY", file: "pdf", targets: [["GV-02", 0]], uploader: "sam", collectedDaysAgo: 60, outcome: "approve" },
    { title: "Code of conduct acknowledgements", category: "RECORD", file: "csv", targets: [["GV-02", 1]], uploader: "sam", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Organizational chart Q3", category: "RECORD", file: "pdf", targets: [["GV-04", 0]], uploader: "sam", collectedDaysAgo: 20, outcome: "approve" },
    { title: "Security roles and responsibilities", category: "POLICY", file: "pdf", targets: [["GV-04", 1]], uploader: "marcus", collectedDaysAgo: 20, outcome: "pending" },
    { title: "Quarterly leadership security review notes", category: "REPORT", file: "pdf", targets: [["GV-05", 0]], uploader: "olivia", collectedDaysAgo: 15, outcome: "approve" },
    { title: "Security awareness training completion", category: "REPORT", file: "csv", targets: [["HR-02", 0]], uploader: "sam", collectedDaysAgo: 380, outcome: "expired", validInDays: -15 },
    { title: "Security awareness course outline", category: "OTHER", file: "txt", targets: [["HR-02", 1]], uploader: "sam", collectedDaysAgo: 90, outcome: "approve" },
    { title: "Offboarding tickets sample", category: "RECORD", file: "csv", targets: [["HR-04", 0]], uploader: "sam", collectedDaysAgo: 10, outcome: "pending" },
    { title: "Signed confidentiality agreements sample", category: "RECORD", file: "pdf", targets: [["HR-05", 0]], uploader: "sam", collectedDaysAgo: 50, outcome: "approve" },
    { title: "Risk assessment 2026", category: "REPORT", file: "pdf", targets: [["RM-01", 0]], uploader: "marcus", collectedDaysAgo: 70, outcome: "approve" },
    { title: "Risk register export", category: "RECORD", file: "csv", targets: [["RM-01", 1], ["RM-03", 0]], uploader: "marcus", collectedDaysAgo: 75, outcome: "expiring", validInDays: 12 },
    { title: "Okta MFA enforcement policy", category: "CONFIGURATION", file: "png", targets: [["AC-01", 0]], uploader: "priya", collectedDaysAgo: 35, outcome: "approve" },
    { title: "Okta users with MFA status", category: "CONFIGURATION", file: "csv", targets: [["AC-01", 1]], uploader: "priya", collectedDaysAgo: 25, outcome: "approve" },
    { title: "Q3 access review with sign-off", category: "REPORT", file: "pdf", targets: [["AC-03", 0]], uploader: "priya", collectedDaysAgo: 100, outcome: "expired", validInDays: -8 },
    { title: "Production access roles", category: "CONFIGURATION", file: "txt", targets: [["AC-04", 0]], uploader: "priya", collectedDaysAgo: 45, outcome: "approve" },
    { title: "Users with production access", category: "RECORD", file: "csv", targets: [["AC-04", 1]], uploader: "priya", collectedDaysAgo: 20, outcome: "reject", comment: "Export is missing the role column and the reviewer sign-off. Re-export with roles and attach the approval." },
    { title: "AWS SOC 2 report review notes", category: "REPORT", file: "pdf", targets: [["AC-07", 0], ["VN-02", 0]], uploader: "marcus", collectedDaysAgo: 90, outcome: "approve" },
    { title: "Jamf device compliance report", category: "REPORT", file: "csv", targets: [["AC-08", 0]], uploader: "priya", collectedDaysAgo: 80, outcome: "expiring", validInDays: 20 },
    { title: "Customer data access procedure", category: "POLICY", file: "pdf", targets: [["AC-09", 0]], uploader: "priya", collectedDaysAgo: 40, outcome: "approve" },
    { title: "Support access log review", category: "LOG", file: "txt", targets: [["AC-09", 1]], uploader: "priya", collectedDaysAgo: 15, outcome: "approve" },
    { title: "Production security groups", category: "CONFIGURATION", file: "png", targets: [["IN-01", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "TLS scan results", category: "REPORT", file: "txt", targets: [["IN-02", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "RDS and S3 encryption settings", category: "CONFIGURATION", file: "png", targets: [["IN-03", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "GitHub branch protection settings", category: "CONFIGURATION", file: "png", targets: [["CM-01", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Merged pull requests with approvals (sample)", category: "RECORD", file: "csv", targets: [["CM-01", 1]], uploader: "priya", collectedDaysAgo: 12, outcome: "approve" },
    { title: "CI pipeline definition", category: "CONFIGURATION", file: "txt", targets: [["CM-02", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Recent CI runs", category: "LOG", file: "csv", targets: [["CM-02", 1]], uploader: "marcus", collectedDaysAgo: 5, outcome: "pending" },
    { title: "Logging and retention configuration", category: "CONFIGURATION", file: "txt", targets: [["OP-01", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Security alert rules", category: "CONFIGURATION", file: "csv", targets: [["OP-01", 1]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Uptime and capacity dashboard", category: "SCREENSHOT", file: "png", targets: [["OP-02", 0]], uploader: "priya", collectedDaysAgo: 20, outcome: "approve" },
    { title: "Vulnerability scan September", category: "REPORT", file: "pdf", targets: [["VM-01", 0]], uploader: "priya", collectedDaysAgo: 70, outcome: "expired", validInDays: -25 },
    { title: "Patch compliance report", category: "REPORT", file: "csv", targets: [["VM-03", 0]], uploader: "priya", collectedDaysAgo: 20, outcome: "approve" },
    { title: "Incident response plan", category: "POLICY", file: "pdf", targets: [["IR-01", 0]], uploader: "marcus", collectedDaysAgo: 120, outcome: "approve" },
    { title: "Incident log", category: "LOG", file: "csv", targets: [["IR-03", 0]], uploader: "marcus", collectedDaysAgo: 3, outcome: "pending" },
    { title: "Backup configuration", category: "CONFIGURATION", file: "png", targets: [["BC-01", 0]], uploader: "priya", collectedDaysAgo: 30, outcome: "approve" },
    { title: "Restore test record", category: "RECORD", file: "txt", targets: [["BC-01", 1]], uploader: "priya", collectedDaysAgo: 18, outcome: "reject", comment: "The record does not show the restore duration or who verified the restored data. Add both and resubmit." },
    { title: "Business continuity and DR plan", category: "POLICY", file: "pdf", targets: [["BC-02", 0]], uploader: "marcus", collectedDaysAgo: 150, outcome: "approve" },
    { title: "Vendor inventory", category: "RECORD", file: "csv", targets: [["VN-01", 1]], uploader: "marcus", collectedDaysAgo: 25, outcome: "approve" },
  ];

  let evidenceCount = 0;
  for (const plan of plans) {
    const uploaderCtx = ctxFor[plan.uploader]!;
    const links = plan.targets.map(([code, idx]) => {
      const control = byCode.get(code)!;
      return { controlId: control.id, evidenceRequirementId: control.evidenceRequirements[idx]?.id ?? null };
    });
    const collectedAt = addDays(today, -plan.collectedDaysAgo);
    const meta = { title: plan.title, category: plan.category, description: "Sample demo evidence. Not real.", collectedAt, validUntil: null, links };
    const lines = [`Organization: Northwind Labs (fictional)`, `Collected: ${collectedAt}`, `Prepared by: ${PEOPLE[plan.uploader].name}`];
    let bytes: Uint8Array;
    let filename: string;
    let mime: string;
    switch (plan.file) {
      case "pdf":
        bytes = await demoPdf(plan.title, [...lines, "", "This document is generated sample data for the AuditTrail demo."]);
        filename = `${plan.title}.pdf`;
        mime = "application/pdf";
        break;
      case "png":
        bytes = demoPng([plan.title.slice(0, 48), ...lines.map((l) => l.slice(0, 48))]);
        filename = `${plan.title}.png`;
        mime = "image/png";
        break;
      case "csv":
        bytes = demoCsv(["item", "owner", "status", "checked_on"], [
          ["example-1", "demo.user@northwind.example", "ok", collectedAt],
          ["example-2", "demo.user2@northwind.example", "ok", collectedAt],
        ]);
        filename = `${plan.title}.csv`;
        mime = "text/csv";
        break;
      default:
        bytes = demoText(plan.title, lines);
        filename = `${plan.title}.txt`;
        mime = "text/plain";
    }
    await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "uploadsPerUser:" } } });
    const { evidenceId } = await uploadEvidenceFile(uploaderCtx, { bytes, filename, declaredMime: mime }, meta);
    evidenceCount += 1;

    // Independent review: the reviewer is never the uploader.
    const reviewer = plan.uploader === "marcus" ? olivia : marcus;
    if (plan.outcome === "approve") await reviewEvidence(reviewer, evidenceId, { decision: "approve" });
    if (plan.outcome === "expired" || plan.outcome === "expiring") {
      await reviewEvidence(reviewer, evidenceId, { decision: "approve", validUntil: addDays(today, plan.validInDays!) });
    }
    if (plan.outcome === "reject") await reviewEvidence(reviewer, evidenceId, { decision: "reject", comment: plan.comment });
  }

  // A link-type evidence item (the trust page).
  await createLinkEvidence(marcus, {
    title: "Northwind security page",
    category: "OTHER",
    description: "Public security commitments page (sample URL).",
    collectedAt: addDays(today, -5),
    url: "https://northwind.example/security",
    links: [{ controlId: byCode.get("GV-07")!.id, evidenceRequirementId: byCode.get("GV-07")!.evidenceRequirements[0]!.id }],
  });
  evidenceCount += 1;
  log(`uploaded ${evidenceCount} evidence items (approved, pending, rejected, expired and expiring)`);

  // ── Control reviews ────────────────────────────────────────────────────────
  const reviews: [string, OrgContext, "EFFECTIVE" | "NEEDS_IMPROVEMENT"][] = [
    ["AC-01", priya, "EFFECTIVE"],
    ["CM-01", priya, "EFFECTIVE"],
    ["GV-01", marcus, "EFFECTIVE"],
    ["IN-01", priya, "EFFECTIVE"],
    ["BC-01", priya, "NEEDS_IMPROVEMENT"],
    ["RM-01", marcus, "EFFECTIVE"],
  ];
  for (const [code, ctx, outcome] of reviews) {
    await recordControlReview(ctx, byCode.get(code)!.id, {
      outcome,
      notes:
        outcome === "EFFECTIVE"
          ? `Reviewed ${code}: operating as designed for the period. Evidence checked against the requirement.`
          : `Reviewed ${code}: backups run, but the restore test record is incomplete. Follow-up task created.`,
    });
  }
  // One overdue review (the review date is a data field set in the past).
  for (const code of ["HR-03", "IR-01"]) {
    const c = await db.control.findUniqueOrThrow({ where: { id: byCode.get(code)!.id } });
    await setNextReviewDate(marcus, c.id, { version: c.version, nextReviewDate: addDays(today, code === "HR-03" ? -12 : -3) });
  }
  log(`recorded ${reviews.length} control reviews; 2 reviews are overdue`);

  // ── Tasks ──────────────────────────────────────────────────────────────────
  type TaskPlan = { title: string; by: OrgContext; assignee?: Person; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; due?: number; controls?: string[]; status?: "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED"; description?: string };
  const taskPlans: TaskPlan[] = [
    { title: "Re-export production access list with roles", by: marcus, assignee: "priya", priority: "HIGH", due: 5, controls: ["AC-04"], status: "IN_PROGRESS" },
    { title: "Complete Q4 user access review", by: marcus, assignee: "priya", priority: "HIGH", due: -4, controls: ["AC-03"] },
    { title: "Run annual security awareness training", by: marcus, assignee: "sam", priority: "HIGH", due: -9, controls: ["HR-02"], status: "IN_PROGRESS" },
    { title: "Document restore duration in restore test record", by: marcus, assignee: "priya", priority: "MEDIUM", due: 10, controls: ["BC-01"] },
    { title: "Schedule annual penetration test", by: olivia, assignee: "marcus", priority: "HIGH", due: 30, controls: ["VM-02"], status: "IN_PROGRESS" },
    { title: "Run September vulnerability scan follow-up", by: marcus, assignee: "priya", priority: "CRITICAL", due: -2, controls: ["VM-01"] },
    { title: "Draft fraud risk section for risk assessment", by: marcus, assignee: "marcus", priority: "MEDIUM", due: 21, controls: ["RM-02"] },
    { title: "Collect background check confirmations", by: sam, assignee: "sam", priority: "MEDIUM", due: 14, controls: ["HR-01"], status: "BLOCKED", description: "Waiting on the screening vendor to enable bulk export." },
    { title: "Publish vulnerability disclosure policy", by: marcus, assignee: "marcus", priority: "LOW", due: 28, controls: ["GV-07"] },
    { title: "Enable AWS Config drift alerts", by: priya, assignee: "priya", priority: "MEDIUM", due: 7, controls: ["OP-03"], status: "IN_PROGRESS" },
    { title: "Write emergency change procedure", by: marcus, assignee: "priya", priority: "LOW", controls: ["CM-01"], status: "DONE" },
    { title: "Rotate production database credentials", by: priya, assignee: "priya", priority: "HIGH", due: -20, controls: ["DP-03"], status: "DONE" },
    { title: "Board security update for Q3", by: olivia, assignee: "olivia", priority: "MEDIUM", due: -30, controls: ["GV-03"], status: "DONE" },
    { title: "Evaluate second MDM vendor", by: priya, priority: "LOW", controls: ["AC-08"], status: "CANCELED" },
    { title: "Review vendor DPAs for new analytics tool", by: marcus, assignee: "marcus", priority: "MEDIUM", due: 18, controls: ["VN-03"] },
    { title: "Prepare tabletop exercise scenario", by: marcus, assignee: "marcus", priority: "MEDIUM", due: 45, controls: ["IR-02"] },
  ];
  const createdTasks = [];
  for (const t of taskPlans) {
    const task = await createTask(t.by, {
      title: t.title,
      description: t.description ?? null,
      priority: t.priority,
      assigneeId: t.assignee ? users[t.assignee].id : null,
      dueDate: t.due !== undefined ? addDays(today, t.due) : null,
      controlIds: ids(t.controls ?? []),
    });
    createdTasks.push(task);
    if (t.status) await changeTaskStatus(t.by, task.id, { status: t.status });
  }

  // Tasks created from detected gaps (pre-filled exactly as the UI does).
  const { gaps } = await loadGaps(marcus);
  const fromGaps = [gaps.find((g) => g.type === "control_unowned"), gaps.find((g) => g.type === "evidence_missing"), gaps.find((g) => g.type === "requirement_uncovered" || g.type === "evidence_rejected")].filter(
    (g): g is NonNullable<typeof g> => Boolean(g),
  );
  for (const [i, g] of fromGaps.entries()) {
    await createTask(marcus, {
      title: g.title,
      description: g.explanation,
      priority: g.severity,
      assigneeId: i === 0 ? users.marcus.id : users.priya.id,
      dueDate: addDays(today, 7 + i * 7),
      controlIds: g.controlIds,
      gapKey: g.key,
    });
  }
  log(`created ${taskPlans.length + fromGaps.length} tasks (${fromGaps.length} from detected gaps)`);

  // ── Risks ──────────────────────────────────────────────────────────────────
  type RiskPlan = {
    title: string;
    by: OrgContext;
    owner: Person;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    due?: number;
    controls: string[];
    plan: string;
    status?: ["IN_PROGRESS" | "MITIGATED" | "ACCEPTED" | "CLOSED", string | null, OrgContext];
  };
  const riskPlans: RiskPlan[] = [
    { title: "Single cloud region for production", by: marcus, owner: "priya", severity: "HIGH", due: 60, controls: ["BC-02", "BC-03"], plan: "Evaluate warm standby in a second region; run a DR test after the change.", status: ["IN_PROGRESS", null, marcus] },
    { title: "Shared admin credentials for legacy billing system", by: marcus, owner: "priya", severity: "CRITICAL", due: -6, controls: ["AC-02", "AC-05"], plan: "Move the billing admin into the identity provider with individual accounts." },
    { title: "Contractors without background checks", by: sam, owner: "sam", severity: "MEDIUM", due: 30, controls: ["HR-01"], plan: "Require checks for contractors with production access starting next quarter." },
    { title: "Phishing susceptibility in finance team", by: marcus, owner: "sam", severity: "MEDIUM", due: 45, controls: ["HR-02"], plan: "Targeted phishing simulation and refresher training." },
    {
      title: "No SOC 2 report from small analytics vendor",
      by: marcus,
      owner: "marcus",
      severity: "LOW",
      controls: ["VN-02"],
      plan: "Vendor processes pseudonymized usage data only; compensating controls reviewed.",
      status: ["ACCEPTED", "Accepted by the CEO: the vendor receives only pseudonymized product usage events, contract includes breach notification within 72 hours, and the vendor completed our security questionnaire. Revisit at renewal.", olivia],
    },
    {
      title: "Laptops without disk encryption",
      by: priya,
      owner: "priya",
      severity: "HIGH",
      controls: ["AC-08"],
      plan: "Enforce FileVault/BitLocker through MDM and block non-compliant devices from SSO.",
      status: ["MITIGATED", "MDM now enforces disk encryption; the compliance report shows 100% of managed devices encrypted. Non-compliant devices are blocked from SSO.", priya],
    },
    { title: "Log retention below 12 months for application logs", by: priya, owner: "priya", severity: "MEDIUM", due: 20, controls: ["OP-01"], plan: "Increase retention in the logging platform and archive to object storage." },
  ];
  for (const r of riskPlans) {
    const risk = await createRisk(r.by, {
      title: r.title,
      description: null,
      kind: "RISK",
      severity: r.severity,
      ownerId: users[r.owner].id,
      dueDate: r.due !== undefined ? addDays(today, r.due) : null,
      treatmentPlan: r.plan,
      controlIds: ids(r.controls),
    });
    if (r.status) await changeRiskStatus(r.status[2], risk.id, { status: r.status[0], resolutionNotes: r.status[1] });
  }
  // One detected gap tracked as a risk.
  const gapForRisk = (await loadGaps(marcus)).gaps.find((g) => g.type === "evidence_expired" && g.trackedBy.length === 0);
  if (gapForRisk) {
    await createRisk(marcus, {
      title: gapForRisk.title,
      description: gapForRisk.explanation,
      kind: "GAP",
      severity: gapForRisk.severity,
      ownerId: users.priya.id,
      dueDate: addDays(today, 14),
      treatmentPlan: "Collect current evidence and submit it for review.",
      controlIds: gapForRisk.controlIds,
      gapKey: gapForRisk.key,
    });
  }
  log(`created ${riskPlans.length + (gapForRisk ? 1 : 0)} risks (one accepted, one mitigated, one tracking a detected gap)`);

  // ── Contoso Health (second demo organization) ─────────────────────────────
  await createOrganization(
    await userCtx(users.elena),
    {
      name: "Contoso Health",
      slug: "contoso-health",
      industry: "Digital health",
      employeeRange: "R11_50",
      description: "Patient scheduling software for clinics. (Fictional demo company.)",
      frameworkKey: "soc2",
      scopeCodes: ["SECURITY", "CONFIDENTIALITY", "PRIVACY"],
      starter: false,
      timezone: "Europe/Berlin",
      auditType: "TYPE_1",
      targetAuditDate: addMonths(today, 6),
    },
    { isDemo: true },
  );
  const elena = await orgCtx(users.elena, "contoso-health");
  const req = async (code: string) => (await db.frameworkRequirement.findFirstOrThrow({ where: { code, framework: { key: "soc2" } } })).id;
  const contosoControls = [
    { code: "CH-01", name: "Patient data encrypted at rest", description: "All databases holding patient records use encryption at rest.", reqs: ["CC6.1", "C1.1"] },
    { code: "CH-02", name: "Quarterly access reviews for clinical data", description: "Access to clinical data stores is reviewed every quarter.", reqs: ["CC6.2", "CC6.3"] },
    { code: "CH-03", name: "Privacy notice published", description: "Patients receive a privacy notice describing collection and use of their data.", reqs: ["P1.1"] },
    { code: "CH-04", name: "Change approval for production", description: "Production changes require peer approval.", reqs: ["CC8.1"] },
  ];
  for (const c of contosoControls) {
    await createControl(elena, {
      code: c.code,
      name: c.name,
      description: c.description,
      priority: "HIGH",
      reviewFrequency: "QUARTERLY",
      ownerId: users.elena.id,
      requirementIds: await Promise.all(c.reqs.map(req)),
      domain: null,
    });
  }
  // Marcus advises both companies: he is an Admin in Contoso too (org switcher + isolation demo).
  const { link } = await createInvitation(elena, { email: PEOPLE.marcus.email, role: "ADMIN" });
  await acceptInvitation(await userCtx(users.marcus), link.split("/").pop());
  log("created Contoso Health with 4 custom controls; Marcus Reed is a member of both organizations");

  // Re-running adoption is idempotent (demonstrates and checks it).
  const rerun = await adoptFramework(olivia, { frameworkKey: "soc2", scopeCodes: ["SECURITY", "AVAILABILITY", "CONFIDENTIALITY"], starter: true });
  if (rerun.controlsCreated !== 0) throw new Error("Adoption was not idempotent");

  // ── Notifications from the real compliance scan ───────────────────────────
  const scan = await runComplianceScan();
  log(`compliance scan created ${scan.created} notifications`);

  log("done");
  log(`demo accounts (dev only), password "${DEMO_PASSWORD}":`);
  for (const p of Object.values(PEOPLE)) log(`  ${p.email.padEnd(28)} ${p.title}`);
}

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
