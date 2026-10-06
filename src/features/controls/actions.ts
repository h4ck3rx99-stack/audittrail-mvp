"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import {
  archiveControl,
  archiveEvidenceRequirement,
  assignControlOwner,
  bulkAssignOwner,
  bulkChangeStatus,
  createControl,
  createEvidenceRequirement,
  mapRequirement,
  recordControlReview,
  restoreControl,
  setNextReviewDate,
  unmapRequirement,
  updateControlDefinition,
  updateControlNotes,
  updateControlStatus,
  updateEvidenceRequirement,
} from "./server/service";

type FormResult = ActionResult<null>;

export async function createControlAction(orgSlug: string, _prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("controls.create", async () => {
    const ctx = await resolveOrgContextForAction(orgSlug);
    const control = await createControl(ctx, formDataToObject(formData, ["requirementIds"]));
    return { id: control.id };
  });
  if (result.ok) redirect(`/org/${orgSlug}/controls/${result.data.id}`);
  return result;
}

export async function updateControlDefinitionAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.updateDefinition", async () => {
    await updateControlDefinition(await resolveOrgContextForAction(orgSlug), controlId, formDataToObject(formData));
    return null;
  });
}

export async function updateControlStatusAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.updateStatus", async () => {
    await updateControlStatus(await resolveOrgContextForAction(orgSlug), controlId, formDataToObject(formData));
    return null;
  });
}

export async function updateControlNotesAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.updateNotes", async () => {
    await updateControlNotes(await resolveOrgContextForAction(orgSlug), controlId, formDataToObject(formData));
    return null;
  });
}

export async function setNextReviewDateAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.setNextReviewDate", async () => {
    await setNextReviewDate(await resolveOrgContextForAction(orgSlug), controlId, formDataToObject(formData));
    return null;
  });
}

export async function assignControlOwnerAction(orgSlug: string, controlId: string, ownerId: string | null, version: number): Promise<FormResult> {
  return runAction("controls.assignOwner", async () => {
    await assignControlOwner(await resolveOrgContextForAction(orgSlug), controlId, { ownerId, version });
    return null;
  });
}

export async function recordReviewAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.review", async () => {
    await recordControlReview(await resolveOrgContextForAction(orgSlug), controlId, formDataToObject(formData));
    return null;
  });
}

export async function archiveControlAction(orgSlug: string, controlId: string): Promise<FormResult> {
  return runAction("controls.archive", async () => {
    await archiveControl(await resolveOrgContextForAction(orgSlug), controlId);
    return null;
  });
}

export async function restoreControlAction(orgSlug: string, controlId: string): Promise<FormResult> {
  return runAction("controls.restore", async () => {
    await restoreControl(await resolveOrgContextForAction(orgSlug), controlId);
    return null;
  });
}

export async function mapRequirementAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.mapRequirement", async () => {
    await mapRequirement(await resolveOrgContextForAction(orgSlug), controlId, formData.get("requirementId"));
    return null;
  });
}

export async function unmapRequirementAction(orgSlug: string, controlId: string, requirementId: string): Promise<FormResult> {
  return runAction("controls.unmapRequirement", async () => {
    await unmapRequirement(await resolveOrgContextForAction(orgSlug), controlId, requirementId);
    return null;
  });
}

export async function createEvidenceRequirementAction(orgSlug: string, controlId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.createEvidenceRequirement", async () => {
    const raw = formDataToObject(formData);
    await createEvidenceRequirement(await resolveOrgContextForAction(orgSlug), controlId, { ...raw, isRequired: raw.isRequired === "on" });
    return null;
  });
}

export async function updateEvidenceRequirementAction(orgSlug: string, requirementId: string, _prev: FormResult | null, formData: FormData): Promise<FormResult> {
  return runAction("controls.updateEvidenceRequirement", async () => {
    const raw = formDataToObject(formData);
    await updateEvidenceRequirement(await resolveOrgContextForAction(orgSlug), requirementId, { ...raw, isRequired: raw.isRequired === "on" });
    return null;
  });
}

export async function archiveEvidenceRequirementAction(orgSlug: string, requirementId: string): Promise<FormResult> {
  return runAction("controls.archiveEvidenceRequirement", async () => {
    await archiveEvidenceRequirement(await resolveOrgContextForAction(orgSlug), requirementId);
    return null;
  });
}

export async function bulkControlsAction(orgSlug: string, _prev: ActionResult<{ updated: number }> | null, formData: FormData): Promise<ActionResult<{ updated: number }>> {
  return runAction("controls.bulk", async () => {
    const ctx = await resolveOrgContextForAction(orgSlug);
    const raw = formDataToObject(formData, ["controlIds"]);
    if (raw.operation === "owner") return bulkAssignOwner(ctx, { controlIds: raw.controlIds, ownerId: raw.ownerId });
    return bulkChangeStatus(ctx, { controlIds: raw.controlIds, status: raw.status, notApplicableReason: raw.notApplicableReason });
  });
}
