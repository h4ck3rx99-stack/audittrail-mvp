import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getStorage } from "@/server/storage";
import { addDays, todayInTimeZone } from "@/lib/dates";
import {
  addEvidenceVersion,
  createLinkEvidence,
  deleteEvidence,
  linkEvidence,
  prepareEvidenceDownload,
  reviewEvidence,
  unlinkEvidence,
  updateEvidence,
  uploadEvidenceFile,
} from "@/features/evidence/server/service";
import { updateEvidencePolicy } from "@/features/organizations/server/service";
import { loadComplianceSnapshot } from "@/features/readiness/server/snapshot";
import { resetDatabase } from "../helpers/db";
import {
  auditEventsFor,
  createOrgWithRoles,
  orgContext,
  type OrgFixture,
} from "../helpers/factories";
import { adoptSoc2, controlByCode, PNG_1PX, samplePdf, uploadPdf } from "../helpers/fixtures";

let f: OrgFixture;

const meta = (links: { controlId: string; evidenceRequirementId?: string | null }[] = []) => ({
  title: "Evidence",
  category: "SCREENSHOT",
  collectedAt: "2026-09-01",
  links,
});

async function requirementState(controlCode: string, index = 0) {
  const snap = await loadComplianceSnapshot(f.ctx.admin);
  const control = snap.controls.find((c) => c.code === controlCode)!;
  const req = control.evidenceRequirements[index]!;
  return snap.evaluations.get(control.id)!.requirements.get(req.id)!.state;
}

describe("evidence uploads", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
    await adoptSoc2(f.ctx.admin);
  });

  it("accepts a valid PDF, stores it and records its SHA-256", async () => {
    const bytes = await samplePdf("hello");
    const result = await uploadEvidenceFile(
      f.ctx.member,
      { bytes, filename: "../../etc/policy.pdf", declaredMime: "application/pdf" },
      meta(),
    );
    const version = await db.evidenceVersion.findUniqueOrThrow({ where: { id: result.versionId } });
    expect(version.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(version.originalFilename).toBe("policy.pdf");
    expect(version.storageKey).toBe(
      `org/${f.org.id}/evidence/${result.evidenceId}/${result.versionId}`,
    );
    expect(version.mimeType).toBe("application/pdf");
    expect(await getStorage().exists(version.storageKey)).toBe(true);
    const evidence = await db.evidence.findUniqueOrThrow({ where: { id: result.evidenceId } });
    expect(evidence.status).toBe("PENDING_REVIEW");
    expect(evidence.currentVersionId).toBe(result.versionId);
    const event = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(event).toMatchObject({
      action: "evidence.uploaded",
      resourceId: result.evidenceId,
      actorUserId: f.users.member.id,
    });
    expect((event.metadata as { sha256: string }).sha256).toBe(version.sha256);
    // Owners and Admins are told there is something to review.
    expect(await db.notification.count({ where: { type: "EVIDENCE_SUBMITTED_FOR_REVIEW" } })).toBe(
      2,
    );
  });

  it("accepts PNG and UTF-8 text files", async () => {
    await uploadEvidenceFile(
      f.ctx.member,
      { bytes: PNG_1PX, filename: "shot.png", declaredMime: "image/png" },
      meta(),
    );
    await uploadEvidenceFile(
      f.ctx.member,
      {
        bytes: Buffer.from("user,mfa\nana,yes\n"),
        filename: "users.csv",
        declaredMime: "text/csv",
      },
      meta(),
    );
    await uploadEvidenceFile(
      f.ctx.member,
      { bytes: Buffer.from("log line\n"), filename: "app.log", declaredMime: "" },
      meta(),
    );
    expect(await db.evidence.count()).toBe(3);
  });

  it.each([
    [
      "disallowed type",
      "tool.exe",
      "application/octet-stream",
      Buffer.from("MZ\x90\x00\x03\x00\x00\x00"),
    ],
    [
      "SVG",
      "logo.svg",
      "image/svg+xml",
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    ],
    ["HTML", "page.html", "text/html", Buffer.from("<!doctype html><html></html>")],
    [
      "HTML disguised as text",
      "notes.txt",
      "text/plain",
      Buffer.from("<html><script>alert(1)</script></html>"),
    ],
    ["archive", "bundle.zip", "application/zip", Buffer.from("PK\x03\x04")],
    ["script", "run.sh", "text/x-sh", Buffer.from("#!/bin/sh\necho hi\n")],
    ["PNG bytes named .pdf", "fake.pdf", "application/pdf", PNG_1PX],
    ["PDF with mismatched declared type", "doc.pdf", "image/png", Buffer.from("%PDF-1.7\n")],
    ["binary content named .txt", "data.txt", "text/plain", PNG_1PX],
    ["NUL bytes in text", "data.csv", "text/csv", Buffer.from("a,b\u0000\n")],
    ["empty file", "empty.txt", "text/plain", Buffer.alloc(0)],
  ])("rejects %s", async (_label, filename, mime, bytes) => {
    await expect(
      uploadEvidenceFile(f.ctx.member, { bytes, filename, declaredMime: mime }, meta()),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.evidence.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: "evidence.uploaded" } })).toBe(0);
  });

  it("rejects oversized files", async () => {
    const big = Buffer.alloc(26 * 1024 * 1024, 0x61);
    await expect(
      uploadEvidenceFile(
        f.ctx.member,
        { bytes: big, filename: "big.txt", declaredMime: "text/plain" },
        meta(),
      ),
    ).rejects.toThrow(/at most 25 MB/);
  });

  it("does not let Viewers upload", async () => {
    await expect(uploadPdf(f.ctx.viewer)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only accepts http(s) URLs for link evidence", async () => {
    await expect(
      createLinkEvidence(f.ctx.member, { ...meta(), url: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const { evidenceId } = await createLinkEvidence(f.ctx.member, {
      ...meta(),
      url: "https://example.com/report",
    });
    expect((await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } })).kind).toBe("LINK");
  });
});

describe("evidence review and requirement satisfaction", () => {
  beforeEach(async () => {
    await resetDatabase();
    f = await createOrgWithRoles("Acme");
    await adoptSoc2(f.ctx.admin);
  });

  it("goes Missing → Pending → Satisfied on approval, and sets validUntil from requirement freshness", async () => {
    const c = await controlByCode(f.org.id, "AC-01");
    const req = c.evidenceRequirements[1]!; // "User list showing MFA status", 90 days
    expect(await requirementState("AC-01", 1)).toBe("MISSING");
    const today = todayInTimeZone("UTC");
    const { evidenceId } = await uploadEvidenceFile(
      f.ctx.member,
      { bytes: PNG_1PX, filename: "mfa.png", declaredMime: "image/png" },
      {
        title: "MFA users",
        category: "SCREENSHOT",
        collectedAt: today,
        links: [{ controlId: c.id, evidenceRequirementId: req.id }],
      },
    );
    expect(await requirementState("AC-01", 1)).toBe("PENDING_REVIEW");
    await reviewEvidence(f.ctx.admin, evidenceId, { decision: "approve" });
    const evidence = await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(evidence.status).toBe("APPROVED");
    expect(evidence.validUntil?.toISOString().slice(0, 10)).toBe(addDays(today, 90));
    expect(await requirementState("AC-01", 1)).toBe("SATISFIED");
    expect((await auditEventsFor(f.org.id)).at(-1)?.action).toBe("evidence.approved");
    expect(
      await db.notification.count({
        where: { recipientId: f.users.member.id, type: "EVIDENCE_REVIEWED" },
      }),
    ).toBe(1);
  });

  it("uses the org default validity when not linked to a requirement", async () => {
    const { evidenceId } = await uploadPdf(f.ctx.member);
    await reviewEvidence(f.ctx.admin, evidenceId, { decision: "approve" });
    const e = await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(e.validUntil?.toISOString().slice(0, 10)).toBe(addDays("2026-09-01", 365));
  });

  it("requires a comment to reject, and rejection leaves the requirement unsatisfied", async () => {
    const c = await controlByCode(f.org.id, "AC-03");
    const { evidenceId } = await uploadPdf(f.ctx.member, [
      { controlId: c.id, evidenceRequirementId: c.evidenceRequirements[0]!.id },
    ]);
    await expect(
      reviewEvidence(f.ctx.admin, evidenceId, { decision: "reject" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await reviewEvidence(f.ctx.admin, evidenceId, {
      decision: "reject",
      comment: "Missing sign-off",
    });
    expect(await requirementState("AC-03")).toBe("REJECTED");
    expect((await auditEventsFor(f.org.id)).at(-1)?.action).toBe("evidence.rejected");
  });

  it("enforces the independent review rule, and the setting can be turned off (audited)", async () => {
    const { evidenceId } = await uploadPdf(f.ctx.admin);
    await expect(reviewEvidence(f.ctx.admin, evidenceId, { decision: "approve" })).rejects.toThrow(
      /independent review/,
    );
    await expect(
      reviewEvidence(f.ctx.member, evidenceId, { decision: "approve" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await updateEvidencePolicy(f.ctx.owner, {
      requireIndependentEvidenceReview: false,
      defaultEvidenceValidityDays: 365,
    });
    const event = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(event).toMatchObject({
      action: "organization.settings_updated",
      changes: { requireIndependentEvidenceReview: { from: true, to: false } },
    });
    const org = await db.organization.findUniqueOrThrow({ where: { id: f.org.id } });
    const adminCtx = await orgContext(org, f.users.admin);
    await reviewEvidence(adminCtx, evidenceId, { decision: "approve" });
    expect((await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } })).status).toBe(
      "APPROVED",
    );
  });

  it("a new version resets status to pending review and keeps older versions", async () => {
    const c = await controlByCode(f.org.id, "AC-03");
    const { evidenceId } = await uploadPdf(f.ctx.member, [
      { controlId: c.id, evidenceRequirementId: c.evidenceRequirements[0]!.id },
    ]);
    await reviewEvidence(f.ctx.admin, evidenceId, { decision: "approve" });
    expect(await requirementState("AC-03")).toBe("SATISFIED");
    const v2 = await addEvidenceVersion(
      f.ctx.member2,
      { bytes: await samplePdf("v2"), filename: "v2.pdf", declaredMime: "application/pdf" },
      { evidenceId },
    );
    expect(v2.versionNumber).toBe(2);
    const e = await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(e).toMatchObject({
      status: "PENDING_REVIEW",
      currentVersionId: v2.versionId,
      validUntil: null,
      reviewedById: null,
    });
    expect(await db.evidenceVersion.count({ where: { evidenceId } })).toBe(2);
    expect(await requirementState("AC-03")).toBe("PENDING_REVIEW");
    // Independent review applies to the uploader of the *current* version.
    await expect(
      reviewEvidence({ ...f.ctx.admin, user: f.users.member2, role: "ADMIN" }, evidenceId, {
        decision: "approve",
      }),
    ).rejects.toThrow(/independent review/);
  });

  it("expired evidence no longer satisfies the requirement", async () => {
    const c = await controlByCode(f.org.id, "AC-03");
    const today = todayInTimeZone("UTC");
    const { evidenceId } = await uploadPdf(f.ctx.member, [
      { controlId: c.id, evidenceRequirementId: c.evidenceRequirements[0]!.id },
    ]);
    await reviewEvidence(f.ctx.admin, evidenceId, {
      decision: "approve",
      validUntil: addDays(today, 10),
    });
    expect(await requirementState("AC-03")).toBe("EXPIRING_SOON");
    await db.evidence.update({
      where: { id: evidenceId },
      data: { validUntil: new Date(`${addDays(today, -1)}T00:00:00Z`) },
    });
    expect(await requirementState("AC-03")).toBe("EXPIRED");
  });

  it("delete and unlink make the requirement unsatisfied; deleted evidence cannot be downloaded", async () => {
    const c = await controlByCode(f.org.id, "AC-03");
    const reqId = c.evidenceRequirements[0]!.id;
    const a = await uploadPdf(
      f.ctx.member,
      [{ controlId: c.id, evidenceRequirementId: reqId }],
      "Policy A",
    );
    await reviewEvidence(f.ctx.admin, a.evidenceId, { decision: "approve" });
    expect(await requirementState("AC-03")).toBe("SATISFIED");

    const link = await db.controlEvidence.findFirstOrThrow({ where: { evidenceId: a.evidenceId } });
    await unlinkEvidence(f.ctx.member, link.id);
    expect(await requirementState("AC-03")).toBe("MISSING");
    await linkEvidence(f.ctx.member, {
      evidenceId: a.evidenceId,
      controlId: c.id,
      evidenceRequirementId: reqId,
    });
    await expect(
      linkEvidence(f.ctx.member, {
        evidenceId: a.evidenceId,
        controlId: c.id,
        evidenceRequirementId: reqId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await requirementState("AC-03")).toBe("SATISFIED");

    // Members may only delete their own uploads while pending review.
    await expect(deleteEvidence(f.ctx.member, a.evidenceId)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteEvidence(f.ctx.admin, a.evidenceId);
    expect(await requirementState("AC-03")).toBe("MISSING");
    const deleted = (await auditEventsFor(f.org.id)).at(-1)!;
    expect(deleted.action).toBe("evidence.deleted");
    expect((deleted.metadata as { currentSha256: string }).currentSha256).toMatch(/^[0-9a-f]{64}$/);
    const version = await db.evidenceVersion.findFirstOrThrow({
      where: { evidenceId: a.evidenceId },
    });
    expect(await getStorage().exists(version.storageKey)).toBe(true); // retained
    await expect(
      prepareEvidenceDownload(f.ctx.viewer, a.evidenceId, version.id, "download"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Viewers can download, and each download is audited", async () => {
    const { evidenceId, versionId } = await uploadPdf(f.ctx.member);
    const v = await prepareEvidenceDownload(f.ctx.viewer, evidenceId, versionId, "download");
    expect(v.storageKey).toContain(evidenceId);
    expect((await auditEventsFor(f.org.id)).at(-1)).toMatchObject({
      action: "evidence.downloaded",
      actorUserId: f.users.viewer.id,
      actorRole: "VIEWER",
    });
  });

  it("Members can edit their own pending uploads only", async () => {
    const { evidenceId } = await uploadPdf(f.ctx.member);
    const input = {
      title: "Renamed",
      category: "POLICY",
      collectedAt: "2026-09-01",
      validUntil: null,
      description: null,
    };
    await expect(updateEvidence(f.ctx.member2, evidenceId, input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await updateEvidence(f.ctx.member, evidenceId, input);
    expect((await auditEventsFor(f.org.id)).at(-1)).toMatchObject({
      action: "evidence.updated",
      changes: { title: { from: "Policy PDF", to: "Renamed" } },
    });
    await reviewEvidence(f.ctx.admin, evidenceId, { decision: "approve" });
    await expect(
      updateEvidence(f.ctx.member, evidenceId, { ...input, title: "Again" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
