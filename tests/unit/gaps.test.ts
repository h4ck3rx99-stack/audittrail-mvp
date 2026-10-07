import { describe, expect, it } from "vitest";
import { detectGaps, groupGaps, parseGapKey, type GapInput } from "@/features/gaps/engine";
import type { ControlInput, EvidenceLinkInput, FrameworkInput } from "@/features/readiness/engine";

const TODAY = "2026-10-07";
const NOW = new Date("2026-10-07T12:00:00Z");
const U = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

const FW: FrameworkInput = {
  id: "fw",
  key: "soc2",
  name: "SOC 2",
  inScopeCategoryIds: ["SEC"],
  requirements: [
    { id: "SEC", code: "SECURITY", title: "Security", kind: "GROUP", parentId: null, sortOrder: 0 },
    { id: "CC6", code: "CC6", title: "Access", kind: "GROUP", parentId: "SEC", sortOrder: 1 },
    { id: "CC6.1", code: "CC6.1", title: "Logical", kind: "REQUIREMENT", parentId: "CC6", sortOrder: 2 },
    { id: "CC6.2", code: "CC6.2", title: "Provisioning", kind: "REQUIREMENT", parentId: "CC6", sortOrder: 3 },
  ],
};

function link(o: Partial<EvidenceLinkInput> = {}): EvidenceLinkInput {
  return { linkId: U(900), evidenceId: U(901), title: "Ev", status: "APPROVED", deleted: false, validUntil: null, reviewComment: null, submittedAt: new Date("2026-09-01T00:00:00Z"), ...o };
}

function control(o: Partial<ControlInput> = {}): ControlInput {
  return {
    id: U(1),
    code: "AC-01",
    name: "MFA",
    status: "IMPLEMENTED",
    priority: "MEDIUM",
    ownerId: "u1",
    archived: false,
    nextReviewDate: "2027-01-01",
    requirementIds: ["CC6.1", "CC6.2"],
    evidenceRequirements: [{ id: U(10), title: "Setting", isRequired: true, archived: false, freshnessDays: 90, links: [link()] }],
    ...o,
  };
}

function input(o: Partial<GapInput>): GapInput {
  return { today: TODAY, now: NOW, frameworks: [FW], controls: [control()], evidence: [], tasks: [], risks: [], ...o };
}

const types = (i: GapInput) => detectGaps(i).map((g) => [g.type, g.severity, g.key]);

describe("detected gaps", () => {
  it("a fully healthy control produces no gaps", () => {
    expect(detectGaps(input({}))).toEqual([]);
  });

  it("unowned control: MEDIUM, HIGH for high/critical priority", () => {
    expect(types(input({ controls: [control({ ownerId: null })] }))).toEqual([["control_unowned", "MEDIUM", `control_unowned:${U(1)}`]]);
    expect(types(input({ controls: [control({ ownerId: null, priority: "CRITICAL" })] }))[0]?.[1]).toBe("HIGH");
  });

  it("missing required evidence follows control priority", () => {
    const c = control({ priority: "CRITICAL", evidenceRequirements: [{ id: U(10), title: "Setting", isRequired: true, archived: false, freshnessDays: 90, links: [] }] });
    expect(types(input({ controls: [c] }))).toEqual([["evidence_missing", "CRITICAL", `evidence_missing:${U(10)}`]]);
  });

  it("expired evidence is HIGH; expiring soon is LOW", () => {
    const expired = control({ evidenceRequirements: [{ id: U(10), title: "S", isRequired: true, archived: false, freshnessDays: 90, links: [link({ validUntil: "2026-10-01" })] }] });
    expect(types(input({ controls: [expired] }))).toEqual([["evidence_expired", "HIGH", `evidence_expired:${U(10)}`]]);
    const expiring = control({ evidenceRequirements: [{ id: U(10), title: "S", isRequired: true, archived: false, freshnessDays: 90, links: [link({ validUntil: "2026-10-20" })] }] });
    expect(types(input({ controls: [expiring] }))).toEqual([["evidence_expiring", "LOW", `evidence_expiring:${U(10)}`]]);
  });

  it("rejected evidence without a newer approved replacement is MEDIUM", () => {
    const rejected = link({ evidenceId: U(50), status: "REJECTED", reviewComment: "bad", submittedAt: new Date("2026-09-10T00:00:00Z") });
    const c = control({ evidenceRequirements: [{ id: U(10), title: "S", isRequired: true, archived: false, freshnessDays: 90, links: [rejected] }] });
    const gaps = detectGaps(input({ controls: [c], evidence: [{ id: U(50), title: "Ev", status: "REJECTED", deleted: false, submittedAt: rejected.submittedAt, reviewComment: "bad" }] }));
    expect(gaps.map((g) => [g.type, g.severity])).toContainEqual(["evidence_rejected", "MEDIUM"]);
    // A newer approved item replaces it.
    const replaced = control({
      evidenceRequirements: [{ id: U(10), title: "S", isRequired: true, archived: false, freshnessDays: 90, links: [rejected, link({ submittedAt: new Date("2026-09-20T00:00:00Z") })] }],
    });
    expect(detectGaps(input({ controls: [replaced] })).some((g) => g.type === "evidence_rejected")).toBe(false);
  });

  it("evidence pending review for more than 7 days is LOW", () => {
    const c = control({ evidenceRequirements: [{ id: U(10), title: "S", isRequired: true, archived: false, freshnessDays: 90, links: [link({ evidenceId: U(60), status: "PENDING_REVIEW" })] }] });
    const ev = (days: number) => ({ id: U(60), title: "Pending", status: "PENDING_REVIEW" as const, deleted: false, submittedAt: new Date(NOW.getTime() - days * 86_400_000), reviewComment: null });
    expect(detectGaps(input({ controls: [c], evidence: [ev(8)] })).find((g) => g.type === "evidence_pending_stale")?.severity).toBe("LOW");
    expect(detectGaps(input({ controls: [c], evidence: [ev(6)] })).some((g) => g.type === "evidence_pending_stale")).toBe(false);
  });

  it("overdue control review is MEDIUM", () => {
    expect(types(input({ controls: [control({ nextReviewDate: "2026-10-01" })] }))).toEqual([["review_overdue", "MEDIUM", `review_overdue:${U(1)}`]]);
  });

  it("in-scope requirement with no applicable control is HIGH", () => {
    expect(types(input({ controls: [control({ requirementIds: ["CC6.1"] })] }))).toEqual([["requirement_uncovered", "HIGH", "requirement_uncovered:CC6.2"]]);
    // N/A controls do not cover requirements, and are not reported as unowned.
    const gaps = detectGaps(input({ controls: [control({ status: "NOT_APPLICABLE", ownerId: null })] }));
    expect(gaps.map((g) => g.type).sort()).toEqual(["requirement_uncovered", "requirement_uncovered"]);
  });

  it("overdue task follows task priority; overdue unresolved risk follows severity", () => {
    const gaps = detectGaps(
      input({
        tasks: [
          { id: U(70), number: 3, title: "T", status: "TODO", priority: "HIGH", dueDate: "2026-10-01", controlIds: [] },
          { id: U(71), number: 4, title: "Done", status: "DONE", priority: "HIGH", dueDate: "2026-10-01", controlIds: [] },
        ],
        risks: [
          { id: U(80), number: 1, title: "R", status: "OPEN", severity: "CRITICAL", dueDate: "2026-10-01", archived: false, controlIds: [] },
          { id: U(81), number: 2, title: "Accepted", status: "ACCEPTED", severity: "CRITICAL", dueDate: "2026-10-01", archived: false, controlIds: [] },
        ],
      }),
    );
    expect(gaps.map((g) => [g.type, g.severity, g.key])).toEqual([
      ["risk_overdue", "CRITICAL", `risk_overdue:${U(80)}`],
      ["task_overdue", "HIGH", `task_overdue:${U(70)}`],
    ]);
  });

  it("sorts by severity and groups by type; gap keys parse", () => {
    const gaps = detectGaps(input({ controls: [control({ ownerId: null, nextReviewDate: "2026-10-01", requirementIds: ["CC6.1"] })] }));
    expect(gaps[0]?.severity).toBe("HIGH");
    expect(groupGaps(gaps)[0]?.type).toBe("requirement_uncovered");
    expect(parseGapKey(`control_unowned:${U(1)}`)).toEqual({ type: "control_unowned", id: U(1) });
    expect(parseGapKey("nope:123")).toBeNull();
  });
});
