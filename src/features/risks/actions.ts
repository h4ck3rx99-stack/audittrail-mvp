"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import { archiveRisk, changeRiskStatus, createRisk, updateRisk } from "./server/service";

type FormResult = ActionResult<null>;

export async function createRiskAction(
  orgSlug: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(
    "risks.create",
    async () => {
      const risk = await createRisk(
        await resolveOrgContextForAction(orgSlug),
        formDataToObject(formData, ["controlIds"]),
      );
      return { id: risk.id };
    },
    { refresh: false },
  );
  if (result.ok) redirect(`/org/${orgSlug}/risks/${result.data.id}`);
  return result;
}

export async function updateRiskAction(
  orgSlug: string,
  riskId: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("risks.update", async () => {
    await updateRisk(
      await resolveOrgContextForAction(orgSlug),
      riskId,
      formDataToObject(formData, ["controlIds"]),
    );
    return null;
  });
}

export async function changeRiskStatusAction(
  orgSlug: string,
  riskId: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("risks.status", async () => {
    await changeRiskStatus(
      await resolveOrgContextForAction(orgSlug),
      riskId,
      formDataToObject(formData),
    );
    return null;
  });
}

export async function archiveRiskAction(orgSlug: string, riskId: string): Promise<FormResult> {
  return runAction("risks.archive", async () => {
    await archiveRisk(await resolveOrgContextForAction(orgSlug), riskId);
    return null;
  });
}
