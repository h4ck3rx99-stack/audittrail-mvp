import { describe, expect, it } from "vitest";
import {
  computeNextReviewDate,
  defaultValidUntil,
  evaluateControl,
  evaluateEvidenceRequirement,
  evaluateFramework,
  freshnessOf,
  type ControlInput,
  type EvidenceLinkInput,
  type FrameworkInput,
} from "@/features/readiness/engine";

const TODAY = "2026-10-07";
let n = 0;
const id = (p: string) => `${p}-${++n}`;

function link(overrides: Partial<EvidenceLinkInput> = {}): EvidenceLinkInput {
  return {
    linkId: id("l"),
    evidenceId: id("e"),
    title: "Evidence",
    status: "APPROVED",
    deleted: false,
    validUntil: "2027-06-01",
    reviewComment: null,
    submittedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function req(
  links: EvidenceLinkInput[],
  overrides: Partial<ControlInput["evidenceRequirements"][number]> = {},
) {
  return {
    id: id("r"),
    title: "Req",
    isRequired: true,
    archived: false,
    freshnessDays: 90,
    links,
    ...overrides,
  };
}

// Framework: SECURITY > CC6 > CC6.1, CC6.2 ; AVAILABILITY > A1 > A1.1
const FW: FrameworkInput = {
  id: "fw",
  key: "soc2",
  name: "SOC 2",
  inScopeCategoryIds: ["SEC"],
  requirements: [
    { id: "SEC", code: "SECURITY", title: "Security", kind: "GROUP", parentId: null, sortOrder: 0 },
    { id: "CC6", code: "CC6", title: "Access", kind: "GROUP", parentId: "SEC", sortOrder: 1 },
    {
      id: "CC6.1",
      code: "CC6.1",
      title: "Logical",
      kind: "REQUIREMENT",
      parentId: "CC6",
      sortOrder: 2,
    },
    {
      id: "CC6.2",
      code: "CC6.2",
      title: "Provisioning",
      kind: "REQUIREMENT",
      parentId: "CC6",
      sortOrder: 3,
    },
    {
      id: "AV",
      code: "AVAILABILITY",
      title: "Availability",
      kind: "GROUP",
      parentId: null,
      sortOrder: 4,
    },
    { id: "A1", code: "A1", title: "A1", kind: "GROUP", parentId: "AV", sortOrder: 5 },
    {
      id: "A1.1",
      code: "A1.1",
      title: "Capacity",
      kind: "REQUIREMENT",
      parentId: "A1",
      sortOrder: 6,
    },
  ],
};

function control(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    id: id("c"),
    code: "AC-01",
    name: "Control",
    status: "IMPLEMENTED",
    priority: "HIGH",
    ownerId: "u1",
    archived: false,
    nextReviewDate: "2027-01-01",
    requirementIds: ["CC6.1"],
    evidenceRequirements: [req([link()])],
    ...overrides,
  };
}

describe("evidence requirement state", () => {
  it("is satisfied by approved, unexpired, non-deleted evidence", () => {
    expect(evaluateEvidenceRequirement(req([link()]), TODAY)).toMatchObject({
      state: "SATISFIED",
      satisfied: true,
    });
    expect(evaluateEvidenceRequirement(req([link({ validUntil: null })]), TODAY)).toMatchObject({
      state: "SATISFIED",
      satisfied: true,
    });
    expect(evaluateEvidenceRequirement(req([link({ validUntil: TODAY })]), TODAY).satisfied).toBe(
      true,
    );
  });
  it("flags evidence expiring within 30 days but still counts it", () => {
    expect(
      evaluateEvidenceRequirement(req([link({ validUntil: "2026-10-20" })]), TODAY),
    ).toMatchObject({ state: "EXPIRING_SOON", satisfied: true });
  });
  it("reports pending, expired, rejected and missing", () => {
    expect(
      evaluateEvidenceRequirement(req([link({ status: "PENDING_REVIEW" })]), TODAY).state,
    ).toBe("PENDING_REVIEW");
    expect(
      evaluateEvidenceRequirement(req([link({ validUntil: "2026-10-06" })]), TODAY),
    ).toMatchObject({ state: "EXPIRED", satisfied: false });
    expect(
      evaluateEvidenceRequirement(req([link({ status: "REJECTED", reviewComment: "no" })]), TODAY),
    ).toMatchObject({ state: "REJECTED", rejectedComment: "no" });
    expect(evaluateEvidenceRequirement(req([]), TODAY).state).toBe("MISSING");
    expect(evaluateEvidenceRequirement(req([link({ deleted: true })]), TODAY).state).toBe(
      "MISSING",
    );
  });
  it("freshness boundaries", () => {
    expect(freshnessOf(null, TODAY)).toBe("NO_EXPIRY");
    expect(freshnessOf("2026-10-06", TODAY)).toBe("EXPIRED");
    expect(freshnessOf("2026-11-06", TODAY)).toBe("EXPIRING_SOON");
    expect(freshnessOf("2026-11-07", TODAY)).toBe("CURRENT");
  });
});

describe("control health", () => {
  it("Ready: implemented, all required evidence satisfied, review not overdue", () => {
    expect(evaluateControl(control(), TODAY).health).toBe("READY");
  });
  it("Attention: implemented with missing evidence or an overdue review", () => {
    expect(evaluateControl(control({ evidenceRequirements: [req([])] }), TODAY).health).toBe(
      "ATTENTION",
    );
    expect(evaluateControl(control({ nextReviewDate: "2026-10-06" }), TODAY)).toMatchObject({
      health: "ATTENTION",
      reviewOverdue: true,
    });
  });
  it("optional and archived requirements do not block readiness", () => {
    const c = control({
      evidenceRequirements: [
        req([link()]),
        req([], { isRequired: false }),
        req([], { archived: true }),
      ],
    });
    expect(evaluateControl(c, TODAY)).toMatchObject({
      health: "READY",
      requiredTotal: 1,
      requiredSatisfied: 1,
    });
  });
  it("Not ready: not started or in progress; N/A and archived have no health", () => {
    expect(evaluateControl(control({ status: "NOT_STARTED" }), TODAY).health).toBe("NOT_READY");
    expect(evaluateControl(control({ status: "IN_PROGRESS" }), TODAY).health).toBe("NOT_READY");
    expect(evaluateControl(control({ status: "NOT_APPLICABLE" }), TODAY).health).toBeNull();
    expect(evaluateControl(control({ archived: true }), TODAY).health).toBeNull();
  });
});

function evaluate(controls: ControlInput[], fw = FW) {
  const evaluations = new Map(controls.map((c) => [c.id, evaluateControl(c, TODAY)]));
  return evaluateFramework(fw, controls, evaluations);
}

describe("framework scores", () => {
  it("shows no percentage (—) when there are zero applicable controls", () => {
    const r = evaluate([
      control({ requirementIds: ["A1.1"] }),
      control({ status: "NOT_APPLICABLE" }),
      control({ archived: true }),
    ]);
    expect(r.readiness).toEqual({ numerator: 0, denominator: 0, pct: null });
    expect(r.evidenceCoverage.pct).toBeNull();
  });

  it("computes readiness and evidence coverage over applicable controls only", () => {
    const ready = control();
    const attention = control({ evidenceRequirements: [req([]), req([link()])] });
    const notStarted = control({
      status: "NOT_STARTED",
      evidenceRequirements: [req([])],
      requirementIds: ["CC6.2"],
    });
    const outOfScope = control({ requirementIds: ["A1.1"] });
    const r = evaluate([ready, attention, notStarted, outOfScope]);
    expect(r.readiness).toEqual({ numerator: 1, denominator: 3, pct: 33 });
    // required: ready 1/1, attention 1/2, notStarted 0/1 → 2/4
    expect(r.evidenceCoverage).toEqual({ numerator: 2, denominator: 4, pct: 50 });
    expect(r.missingRequiredEvidence).toBe(2);
  });

  it("requirement coverage: covered, partial, uncovered", () => {
    const r1 = evaluate([
      control({ requirementIds: ["CC6.1"] }),
      control({ status: "IN_PROGRESS", requirementIds: ["CC6.2"] }),
    ]);
    expect(r1.coverage.get("CC6.1")?.state).toBe("COVERED");
    expect(r1.coverage.get("CC6.2")?.state).toBe("PARTIAL");
    const r2 = evaluate([control({ requirementIds: ["CC6.1"] })]);
    expect(r2.coverage.get("CC6.2")?.state).toBe("UNCOVERED");
    // A not-applicable control does not cover anything.
    const r3 = evaluate([control({ status: "NOT_APPLICABLE", requirementIds: ["CC6.2"] })]);
    expect(r3.coverage.get("CC6.2")?.state).toBe("UNCOVERED");
  });

  it("breaks readiness down per in-scope category and series", () => {
    const r = evaluate([control(), control({ status: "IN_PROGRESS" })], {
      ...FW,
      inScopeCategoryIds: ["SEC", "AV"],
    });
    expect(r.categories.map((c) => [c.code, c.ready, c.applicable])).toEqual([
      ["SECURITY", 1, 2],
      ["AVAILABILITY", 0, 0],
    ]);
    expect(r.series.find((s) => s.code === "CC6")).toMatchObject({ ready: 1, applicable: 2 });
  });
});

describe("review scheduling and validity defaults", () => {
  it("computes next review dates from the frequency", () => {
    expect(computeNextReviewDate("2026-10-07", "MONTHLY")).toBe("2026-11-07");
    expect(computeNextReviewDate("2026-10-07", "QUARTERLY")).toBe("2027-01-07");
    expect(computeNextReviewDate("2026-08-31", "SEMI_ANNUALLY")).toBe("2027-02-28");
    expect(computeNextReviewDate("2026-10-07", "ANNUALLY")).toBe("2027-10-07");
  });
  it("defaults validUntil to collectedAt + the shortest linked freshness, else the org default", () => {
    expect(defaultValidUntil("2026-10-01", [365, 90], 365)).toBe("2026-12-30");
    expect(defaultValidUntil("2026-10-01", [], 30)).toBe("2026-10-31");
  });
});
