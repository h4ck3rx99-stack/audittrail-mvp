"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import {
  createLinkEvidence,
  deleteEvidence,
  linkEvidence,
  reviewEvidence,
  unlinkEvidence,
  updateEvidence,
} from "./server/service";

type FormResult = ActionResult<null>;

export async function linkEvidenceAction(
  orgSlug: string,
  input: { evidenceId: string; controlId: string; evidenceRequirementId: string | null },
): Promise<FormResult> {
  return runAction("evidence.link", async () => {
    await linkEvidence(await resolveOrgContextForAction(orgSlug), input);
    return null;
  });
}

export async function unlinkEvidenceAction(orgSlug: string, linkId: string): Promise<FormResult> {
  return runAction("evidence.unlink", async () => {
    await unlinkEvidence(await resolveOrgContextForAction(orgSlug), linkId);
    return null;
  });
}

export async function reviewEvidenceAction(
  orgSlug: string,
  evidenceId: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("evidence.review", async () => {
    await reviewEvidence(
      await resolveOrgContextForAction(orgSlug),
      evidenceId,
      formDataToObject(formData),
    );
    return null;
  });
}

export async function updateEvidenceAction(
  orgSlug: string,
  evidenceId: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("evidence.update", async () => {
    await updateEvidence(
      await resolveOrgContextForAction(orgSlug),
      evidenceId,
      formDataToObject(formData),
    );
    return null;
  });
}

export async function deleteEvidenceAction(
  orgSlug: string,
  evidenceId: string,
): Promise<FormResult> {
  const result = await runAction(
    "evidence.delete",
    async () => {
      await deleteEvidence(await resolveOrgContextForAction(orgSlug), evidenceId);
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect(`/org/${orgSlug}/evidence`);
  return result;
}

export async function createLinkEvidenceAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionResult<{ evidenceId: string }>> {
  return runAction(
    "evidence.createLink",
    async () => createLinkEvidence(await resolveOrgContextForAction(orgSlug), input),
    { refresh: false },
  );
}
