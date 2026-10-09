import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "@/server/db";
import type { OrgContext } from "@/server/context";
import { adoptFramework } from "@/features/frameworks/server/service";
import { uploadEvidenceFile } from "@/features/evidence/server/service";

export const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

export async function samplePdf(text = "SAMPLE"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  page.drawText(text, {
    x: 20,
    y: 100,
    size: 12,
    font: await doc.embedFont(StandardFonts.Helvetica),
  });
  return doc.save();
}

/** Adopts SOC 2 (Security + Availability + Confidentiality) with the starter control set. */
export async function adoptSoc2(
  ctx: OrgContext,
  scopeCodes = ["SECURITY", "AVAILABILITY", "CONFIDENTIALITY"],
) {
  return adoptFramework(ctx, { frameworkKey: "soc2", scopeCodes, starter: true });
}

export async function controlByCode(organizationId: string, code: string) {
  return db.control.findFirstOrThrow({
    where: { organizationId, code },
    include: { evidenceRequirements: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function uploadPdf(
  ctx: OrgContext,
  links: { controlId: string; evidenceRequirementId?: string | null }[] = [],
  title = "Policy PDF",
) {
  return uploadEvidenceFile(
    ctx,
    { bytes: await samplePdf(title), filename: `${title}.pdf`, declaredMime: "application/pdf" },
    {
      title,
      category: "POLICY",
      collectedAt: "2026-09-01",
      validUntil: null,
      description: null,
      links,
    },
  );
}
