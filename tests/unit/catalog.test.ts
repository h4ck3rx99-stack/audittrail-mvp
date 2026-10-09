import { describe, expect, it } from "vitest";
import { SOC2 } from "@/server/frameworks/soc2";
import { validateFrameworkDefinition } from "@/server/frameworks/catalog-sync";

describe("SOC 2 catalog content", () => {
  it("is internally consistent", () => {
    expect(() => validateFrameworkDefinition(SOC2)).not.toThrow();
  });

  it("has 45–55 starter control templates with 1–3 evidence requirements each", () => {
    expect(SOC2.controlTemplates.length).toBeGreaterThanOrEqual(45);
    expect(SOC2.controlTemplates.length).toBeLessThanOrEqual(55);
    for (const t of SOC2.controlTemplates) {
      expect(t.evidence.length).toBeGreaterThanOrEqual(1);
      expect(t.evidence.length).toBeLessThanOrEqual(3);
      expect(t.guidance.split(/(?<=\.)\s/).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("maps every Security (CC) criterion with at least one template, and covers A1 and C1", () => {
    const mapped = new Set(SOC2.controlTemplates.flatMap((t) => t.requirementCodes));
    const cc = SOC2.requirements.filter((r) => r.kind === "REQUIREMENT" && r.code.startsWith("CC"));
    expect(cc).toHaveLength(33);
    expect(cc.filter((r) => !mapped.has(r.code)).map((r) => r.code)).toEqual([]);
    for (const code of ["A1.1", "A1.2", "A1.3", "C1.1", "C1.2"])
      expect(mapped.has(code)).toBe(true);
  });

  it("defines every category and criterion from the 2017 TSC structure", () => {
    const codes = SOC2.requirements.map((r) => r.code);
    for (const code of [
      "SECURITY",
      "AVAILABILITY",
      "CONFIDENTIALITY",
      "PROCESSING_INTEGRITY",
      "PRIVACY",
      "PI1.5",
      "P6.7",
      "P8.1",
    ]) {
      expect(codes).toContain(code);
    }
    expect(SOC2.requirements.find((r) => r.code === "SECURITY")?.isScopeRequired).toBe(true);
  });

  it("contains no certification claims", () => {
    const text = JSON.stringify(SOC2).toLowerCase();
    expect(text).not.toMatch(/soc 2 (certified|compliant)/);
  });
});
