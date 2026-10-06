import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/env";
import { db, type Tx } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { withAuditedTransaction, type AuditedTransactionHelpers } from "@/server/audit/record";
import { diffFields, hasChanges } from "@/server/audit/diff";
import { parseInput } from "@/server/validation";
import type { OrgContext } from "@/server/context";
import { assertUuid, managerIds } from "@/server/tenancy";
import { uuidv7 } from "@/server/ids";
import { enforceRateLimit } from "@/server/rate-limit";
import { checkUploadedFile, sanitizeFilename, scanFile } from "@/server/files/detect";
import { evidenceStorageKey, getStorage } from "@/server/storage";
import { logger } from "@/server/logger";
import { fromDateOnly, fromDateOnlyOrNull, toDateOnly, toDateOnlyOrNull } from "@/lib/dates";
import { defaultValidUntil } from "@/features/readiness/engine";
import {
  createLinkEvidenceSchema,
  linkEvidenceSchema,
  reviewEvidenceSchema,
  updateEvidenceSchema,
  uploadMetadataSchema,
  versionMetadataSchema,
  type EvidenceLinkTarget,
} from "../schemas";

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

async function loadEvidence(client: Tx | typeof db, ctx: OrgContext, evidenceId: unknown) {
  assertUuid(evidenceId, "Evidence");
  const evidence = await client.evidence.findFirst({
    where: { id: evidenceId, organizationId: ctx.org.id, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!evidence) throw new NotFoundError("Evidence not found.");
  return evidence;
}

/** Validates link targets: controls and requirements must belong to this org and be active. */
async function resolveLinkTargets(ctx: OrgContext, targets: readonly EvidenceLinkTarget[]) {
  if (targets.length === 0) return [];
  const controlIds = [...new Set(targets.map((t) => t.controlId))];
  const controls = await db.control.findMany({
    where: { organizationId: ctx.org.id, id: { in: controlIds } },
    select: { id: true, code: true, archivedAt: true, evidenceRequirements: { select: { id: true, title: true, archivedAt: true } } },
  });
  if (controls.length !== controlIds.length) throw new NotFoundError("Control not found.");
  const byId = new Map(controls.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const resolved: { controlId: string; controlCode: string; evidenceRequirementId: string | null; requirementTitle: string | null }[] = [];
  for (const t of targets) {
    const control = byId.get(t.controlId)!;
    if (control.archivedAt) throw new ConflictError(`${control.code} is archived.`);
    let requirementTitle: string | null = null;
    if (t.evidenceRequirementId) {
      const req = control.evidenceRequirements.find((r) => r.id === t.evidenceRequirementId);
      if (!req) throw new NotFoundError("Evidence requirement not found.");
      if (req.archivedAt) throw new ConflictError("That evidence requirement is archived.");
      requirementTitle = req.title;
    }
    const key = `${t.controlId}:${t.evidenceRequirementId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ controlId: control.id, controlCode: control.code, evidenceRequirementId: t.evidenceRequirementId, requirementTitle });
  }
  return resolved;
}

async function createLinks(
  ctx: OrgContext,
  { tx, audit }: AuditedTransactionHelpers,
  evidence: { id: string; title: string },
  links: Awaited<ReturnType<typeof resolveLinkTargets>>,
) {
  for (const l of links) {
    const link = await tx.controlEvidence.create({
      data: {
        organizationId: ctx.org.id,
        controlId: l.controlId,
        evidenceId: evidence.id,
        evidenceRequirementId: l.evidenceRequirementId,
        linkedById: ctx.user.id,
      },
    });
    await audit.record({
      action: "evidence.linked",
      resourceType: "evidence",
      resourceId: evidence.id,
      resourceLabel: evidence.title,
      metadata: {
        linkId: link.id,
        controlId: l.controlId,
        controlCode: l.controlCode,
        evidenceRequirementId: l.evidenceRequirementId,
        requirementTitle: l.requirementTitle,
      },
    });
  }
}

async function notifyReviewers(ctx: OrgContext, helpers: AuditedTransactionHelpers, evidence: { id: string; title: string }) {
  for (const recipientId of await managerIds(helpers.tx, ctx.org.id)) {
    await helpers.notify({
      type: "EVIDENCE_SUBMITTED_FOR_REVIEW",
      organizationId: ctx.org.id,
      recipientId,
      payload: { orgSlug: ctx.org.slug, evidenceId: evidence.id, evidenceTitle: evidence.title, actorName: ctx.user.name },
    });
  }
}

export type UploadedFile = { bytes: Uint8Array; filename: string; declaredMime: string | null };

/** Validates bytes, scans, computes SHA-256 and stores the file. Returns version facts. */
async function storeFile(ctx: OrgContext, file: UploadedFile, evidenceId: string) {
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`Files can be at most ${env.MAX_UPLOAD_MB} MB.`, { file: [`Files can be at most ${env.MAX_UPLOAD_MB} MB.`] });
  }
  const filename = sanitizeFilename(file.filename);
  const check = await checkUploadedFile(filename, file.declaredMime, file.bytes);
  if (!check.ok) throw new ValidationError(check.reason, { file: [check.reason] });
  const scan = await scanFile(file.bytes, { filename, mime: check.mime });
  if (!scan.clean) throw new ValidationError("The file was rejected by the malware scanner.", { file: ["The file was rejected by the malware scanner."] });
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const versionId = uuidv7();
  const storageKey = evidenceStorageKey(ctx.org.id, evidenceId, versionId);
  await getStorage().put(storageKey, file.bytes, check.mime);
  return { versionId, storageKey, filename, mime: check.mime, sizeBytes: file.bytes.byteLength, sha256 };
}

async function discardStoredFile(storageKey: string) {
  try {
    await getStorage().delete?.(storageKey);
  } catch (error) {
    logger.warn({ err: error }, "could not remove orphaned upload");
  }
}

export async function uploadEvidenceFile(ctx: OrgContext, file: UploadedFile, rawMetadata: unknown) {
  assertCan(ctx, "evidence.contribute");
  await enforceRateLimit("uploadsPerUser", ctx.user.id, "Too many uploads. Wait a minute and try again.");
  const meta = parseInput(uploadMetadataSchema, rawMetadata);
  const links = await resolveLinkTargets(ctx, meta.links);
  const evidenceId = uuidv7();
  const stored = await storeFile(ctx, file, evidenceId);

  try {
    return await withAuditedTransaction(ctx, async (helpers) => {
      const { tx, audit } = helpers;
      const evidence = await tx.evidence.create({
        data: {
          id: evidenceId,
          organizationId: ctx.org.id,
          title: meta.title,
          description: meta.description,
          kind: "FILE",
          category: meta.category,
          collectedAt: fromDateOnly(meta.collectedAt),
          validUntil: fromDateOnlyOrNull(meta.validUntil),
          uploadedById: ctx.user.id,
        },
      });
      await tx.evidenceVersion.create({
        data: {
          id: stored.versionId,
          organizationId: ctx.org.id,
          evidenceId,
          versionNumber: 1,
          storageKey: stored.storageKey,
          originalFilename: stored.filename,
          mimeType: stored.mime,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          uploadedById: ctx.user.id,
        },
      });
      await tx.evidence.update({ where: { id: evidenceId }, data: { currentVersionId: stored.versionId } });
      await audit.record({
        action: "evidence.uploaded",
        resourceType: "evidence",
        resourceId: evidenceId,
        resourceLabel: meta.title,
        metadata: {
          kind: "FILE",
          category: meta.category,
          versionId: stored.versionId,
          filename: stored.filename,
          mimeType: stored.mime,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
        },
      });
      await createLinks(ctx, helpers, evidence, links);
      await notifyReviewers(ctx, helpers, evidence);
      return { evidenceId, versionId: stored.versionId, sha256: stored.sha256 };
    });
  } catch (error) {
    await discardStoredFile(stored.storageKey);
    throw error;
  }
}

export async function addEvidenceVersion(ctx: OrgContext, file: UploadedFile, rawMetadata: unknown) {
  assertCan(ctx, "evidence.contribute");
  await enforceRateLimit("uploadsPerUser", ctx.user.id, "Too many uploads. Wait a minute and try again.");
  const meta = parseInput(versionMetadataSchema, rawMetadata);
  const evidence = await loadEvidence(db, ctx, meta.evidenceId);
  if (evidence.kind !== "FILE") throw new ValidationError("Link evidence has no file versions. Edit the link instead.");
  const stored = await storeFile(ctx, file, evidence.id);

  try {
    return await withAuditedTransaction(ctx, async (helpers) => {
      const { tx, audit } = helpers;
      const last = await tx.evidenceVersion.findFirst({
        where: { evidenceId: evidence.id, organizationId: ctx.org.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const versionNumber = (last?.versionNumber ?? 0) + 1;
      await tx.evidenceVersion.create({
        data: {
          id: stored.versionId,
          organizationId: ctx.org.id,
          evidenceId: evidence.id,
          versionNumber,
          storageKey: stored.storageKey,
          originalFilename: stored.filename,
          mimeType: stored.mime,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          uploadedById: ctx.user.id,
        },
      });
      const data = {
        currentVersionId: stored.versionId,
        status: "PENDING_REVIEW" as const,
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null,
        validUntil: null,
        ...(meta.collectedAt ? { collectedAt: fromDateOnly(meta.collectedAt) } : {}),
      };
      const changes = diffFields(evidence, data, ["status", "validUntil", "collectedAt"], { dateOnly: ["validUntil", "collectedAt"] });
      await tx.evidence.updateMany({ where: { id: evidence.id, organizationId: ctx.org.id }, data });
      await audit.record({
        action: "evidence.version_added",
        resourceType: "evidence",
        resourceId: evidence.id,
        resourceLabel: evidence.title,
        changes,
        metadata: {
          versionId: stored.versionId,
          versionNumber,
          filename: stored.filename,
          mimeType: stored.mime,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          previousVersionId: evidence.currentVersionId,
        },
      });
      await notifyReviewers(ctx, helpers, evidence);
      return { evidenceId: evidence.id, versionId: stored.versionId, versionNumber };
    });
  } catch (error) {
    await discardStoredFile(stored.storageKey);
    throw error;
  }
}

export async function createLinkEvidence(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "evidence.contribute");
  const input = parseInput(createLinkEvidenceSchema, raw);
  const links = await resolveLinkTargets(ctx, input.links);
  return withAuditedTransaction(ctx, async (helpers) => {
    const evidence = await helpers.tx.evidence.create({
      data: {
        organizationId: ctx.org.id,
        title: input.title,
        description: input.description,
        kind: "LINK",
        url: input.url,
        category: input.category,
        collectedAt: fromDateOnly(input.collectedAt),
        validUntil: fromDateOnlyOrNull(input.validUntil),
        uploadedById: ctx.user.id,
      },
    });
    await helpers.audit.record({
      action: "evidence.uploaded",
      resourceType: "evidence",
      resourceId: evidence.id,
      resourceLabel: evidence.title,
      metadata: { kind: "LINK", category: input.category, url: input.url },
    });
    await createLinks(ctx, helpers, evidence, links);
    await notifyReviewers(ctx, helpers, evidence);
    return { evidenceId: evidence.id };
  });
}

export async function updateEvidence(ctx: OrgContext, evidenceId: unknown, raw: unknown) {
  const before = await loadEvidence(db, ctx, evidenceId);
  assertCan(ctx, "evidence.editMetadata", { uploadedById: before.uploadedById, status: before.status });
  const input = parseInput(updateEvidenceSchema, raw);
  if (before.kind === "LINK" && !input.url) throw new ValidationError("Enter the link URL.", { url: ["Enter an http:// or https:// URL."] });
  const data = {
    title: input.title,
    description: input.description,
    category: input.category,
    collectedAt: fromDateOnly(input.collectedAt),
    validUntil: fromDateOnlyOrNull(input.validUntil),
    ...(before.kind === "LINK" ? { url: input.url } : {}),
  };
  const changes = diffFields(before, data, ["title", "description", "category", "collectedAt", "validUntil", "url"], {
    dateOnly: ["collectedAt", "validUntil"],
  });
  if (!hasChanges(changes)) return;
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.evidence.updateMany({ where: { id: before.id, organizationId: ctx.org.id, deletedAt: null }, data });
    await audit.record({ action: "evidence.updated", resourceType: "evidence", resourceId: before.id, resourceLabel: data.title, changes });
  });
}

/** Soft delete: the file is retained in storage, the hash is recorded, links stop counting. */
export async function deleteEvidence(ctx: OrgContext, evidenceId: unknown) {
  const evidence = await loadEvidence(db, ctx, evidenceId);
  assertCan(ctx, "evidence.editMetadata", { uploadedById: evidence.uploadedById, status: evidence.status });
  const versions = await db.evidenceVersion.findMany({
    where: { evidenceId: evidence.id, organizationId: ctx.org.id },
    orderBy: { versionNumber: "asc" },
    select: { versionNumber: true, sha256: true },
  });
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    const res = await tx.evidence.updateMany({
      where: { id: evidence.id, organizationId: ctx.org.id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: ctx.user.id },
    });
    if (res.count === 0) throw new NotFoundError("Evidence not found.");
    await audit.record({
      action: "evidence.deleted",
      resourceType: "evidence",
      resourceId: evidence.id,
      resourceLabel: evidence.title,
      metadata: {
        kind: evidence.kind,
        status: evidence.status,
        currentSha256: evidence.currentVersion?.sha256 ?? null,
        versions: versions.map((v) => ({ versionNumber: v.versionNumber, sha256: v.sha256 })),
        url: evidence.url,
      },
    });
  });
}

export async function linkEvidence(ctx: OrgContext, raw: unknown) {
  assertCan(ctx, "evidence.contribute");
  const input = parseInput(linkEvidenceSchema, raw);
  const evidence = await loadEvidence(db, ctx, input.evidenceId);
  const [target] = await resolveLinkTargets(ctx, [{ controlId: input.controlId, evidenceRequirementId: input.evidenceRequirementId }]);
  const duplicate = await db.controlEvidence.findFirst({
    where: {
      organizationId: ctx.org.id,
      evidenceId: evidence.id,
      controlId: target!.controlId,
      evidenceRequirementId: target!.evidenceRequirementId,
    },
    select: { id: true },
  });
  if (duplicate) throw new ConflictError("This evidence is already linked there.");
  try {
    await withAuditedTransaction(ctx, (helpers) => createLinks(ctx, helpers, evidence, [target!]));
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("This evidence is already linked there.");
    throw error;
  }
}

export async function unlinkEvidence(ctx: OrgContext, linkId: unknown) {
  assertCan(ctx, "evidence.contribute");
  assertUuid(linkId, "Link");
  const link = await db.controlEvidence.findFirst({
    where: { id: linkId, organizationId: ctx.org.id },
    select: {
      id: true,
      evidenceRequirementId: true,
      evidenceRequirement: { select: { title: true } },
      control: { select: { id: true, code: true } },
      evidence: { select: { id: true, title: true } },
    },
  });
  if (!link) throw new NotFoundError("Link not found.");
  await withAuditedTransaction(ctx, async ({ tx, audit }) => {
    await tx.controlEvidence.deleteMany({ where: { id: link.id, organizationId: ctx.org.id } });
    await audit.record({
      action: "evidence.unlinked",
      resourceType: "evidence",
      resourceId: link.evidence.id,
      resourceLabel: link.evidence.title,
      metadata: {
        linkId: link.id,
        controlId: link.control.id,
        controlCode: link.control.code,
        evidenceRequirementId: link.evidenceRequirementId,
        requirementTitle: link.evidenceRequirement?.title ?? null,
      },
    });
  });
}

export async function reviewEvidence(ctx: OrgContext, evidenceId: unknown, raw: unknown) {
  const evidence = await loadEvidence(db, ctx, evidenceId);
  const versionUploadedById = evidence.currentVersion?.uploadedById ?? evidence.uploadedById;
  assertCan(ctx, "evidence.review", { versionUploadedById });
  const input = parseInput(reviewEvidenceSchema, raw);
  if (evidence.status !== "PENDING_REVIEW") {
    throw new ConflictError("Only evidence that is pending review can be approved or rejected. Upload a new version to start a new review.");
  }
  const approve = input.decision === "approve";
  const collectedAt = toDateOnly(evidence.collectedAt);
  if (input.validUntil && input.validUntil < collectedAt) {
    throw new ValidationError("Valid until must be on or after the collected date.", { validUntil: ["Choose a later date."] });
  }

  let validUntil = toDateOnlyOrNull(evidence.validUntil);
  if (approve) {
    if (input.validUntil) validUntil = input.validUntil;
    else if (!validUntil) {
      const linked = await db.controlEvidence.findMany({
        where: { organizationId: ctx.org.id, evidenceId: evidence.id, evidenceRequirementId: { not: null } },
        select: { evidenceRequirement: { select: { freshnessDays: true } } },
      });
      validUntil = defaultValidUntil(
        collectedAt,
        linked.map((l) => l.evidenceRequirement?.freshnessDays).filter((d): d is number => typeof d === "number"),
        ctx.org.defaultEvidenceValidityDays,
      );
    }
  }
  const data = {
    status: approve ? ("APPROVED" as const) : ("REJECTED" as const),
    reviewedById: ctx.user.id,
    reviewedAt: new Date(),
    reviewComment: input.comment,
    validUntil: fromDateOnlyOrNull(validUntil),
  };
  const changes = diffFields(evidence, data, ["status", "validUntil", "reviewComment"], { dateOnly: ["validUntil"] });

  await withAuditedTransaction(ctx, async ({ tx, audit, notify }) => {
    const res = await tx.evidence.updateMany({
      where: { id: evidence.id, organizationId: ctx.org.id, deletedAt: null, status: "PENDING_REVIEW", currentVersionId: evidence.currentVersionId },
      data,
    });
    if (res.count === 0) throw new ConflictError("This evidence changed while you were reviewing it. Reload and try again.");
    await audit.record({
      action: approve ? "evidence.approved" : "evidence.rejected",
      resourceType: "evidence",
      resourceId: evidence.id,
      resourceLabel: evidence.title,
      changes,
      metadata: { versionId: evidence.currentVersionId, versionUploadedById },
    });
    await notify({
      type: "EVIDENCE_REVIEWED",
      organizationId: ctx.org.id,
      recipientId: versionUploadedById,
      payload: {
        orgSlug: ctx.org.slug,
        evidenceId: evidence.id,
        evidenceTitle: evidence.title,
        approved: approve,
        actorName: ctx.user.name,
        comment: input.comment,
      },
    });
  });
}

/**
 * Authorizes a download, records `evidence.downloaded`, and returns what the route needs to
 * stream the file. Deleted evidence and versions of other tenants are "not found".
 */
export async function prepareEvidenceDownload(ctx: OrgContext, evidenceId: unknown, versionId: unknown, purpose: "download" | "preview") {
  assertCan(ctx, "evidence.download");
  assertUuid(evidenceId, "Evidence");
  assertUuid(versionId, "Version");
  const version = await db.evidenceVersion.findFirst({
    where: { id: versionId, evidenceId, organizationId: ctx.org.id, evidence: { deletedAt: null } },
    select: {
      id: true,
      versionNumber: true,
      storageKey: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      sha256: true,
      evidence: { select: { id: true, title: true } },
    },
  });
  if (!version) throw new NotFoundError("File not found.");
  await withAuditedTransaction(ctx, async ({ audit }) => {
    await audit.record({
      action: "evidence.downloaded",
      resourceType: "evidence",
      resourceId: version.evidence.id,
      resourceLabel: version.evidence.title,
      metadata: { versionId: version.id, versionNumber: version.versionNumber, sha256: version.sha256, purpose },
    });
  });
  return version;
}
