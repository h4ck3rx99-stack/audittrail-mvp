"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction, resolveUserContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import {
  createOrganization,
  isSlugAvailable,
  updateEvidencePolicy,
  updateOrganizationProfile,
} from "./server/service";
import { adoptFramework, updateFrameworkScope } from "@/features/frameworks/server/service";

type FormResult = ActionResult<null>;

export async function checkSlugAction(
  slug: string,
): Promise<ActionResult<{ available: boolean; reason?: string }>> {
  return runAction(
    "org.checkSlug",
    async () => {
      await resolveUserContextForAction();
      return isSlugAvailable(typeof slug === "string" ? slug : "");
    },
    { refresh: false },
  );
}

export async function createOrganizationAction(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const result = await runAction(
    "org.create",
    async () => {
      const ctx = await resolveUserContextForAction();
      const { org } = await createOrganization(ctx, input);
      return { slug: org.slug };
    },
    { refresh: false },
  );
  if (result.ok) redirect(`/org/${result.data.slug}/dashboard`);
  return result;
}

export async function updateOrganizationAction(
  orgSlug: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("org.update", async () => {
    await updateOrganizationProfile(
      await resolveOrgContextForAction(orgSlug),
      formDataToObject(formData),
    );
    return null;
  });
}

export async function updateEvidencePolicyAction(
  orgSlug: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("org.evidencePolicy", async () => {
    const raw = formDataToObject(formData);
    await updateEvidencePolicy(await resolveOrgContextForAction(orgSlug), {
      requireIndependentEvidenceReview: raw.requireIndependentEvidenceReview === "on",
      defaultEvidenceValidityDays: raw.defaultEvidenceValidityDays,
    });
    return null;
  });
}

export async function updateScopeAction(
  orgSlug: string,
  frameworkKey: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("org.updateScope", async () => {
    await updateFrameworkScope(await resolveOrgContextForAction(orgSlug), {
      frameworkKey,
      scopeCodes: formData.getAll("scopeCodes").map(String),
    });
    return null;
  });
}

export async function adoptFrameworkAction(
  orgSlug: string,
  _prev: ActionResult<{ controlsCreated: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ controlsCreated: number }>> {
  return runAction("org.adoptFramework", async () => {
    const result = await adoptFramework(await resolveOrgContextForAction(orgSlug), {
      frameworkKey: formData.get("frameworkKey"),
      scopeCodes: formData.getAll("scopeCodes").map(String),
      starter: formData.get("starter") === "on",
    });
    return { controlsCreated: result.controlsCreated };
  });
}
