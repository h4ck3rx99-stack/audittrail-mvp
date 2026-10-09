import type { Metadata } from "next";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { getOrganization } from "@/features/organizations/server/service";
import { EvidencePolicyForm } from "@/features/organizations/components/settings-forms";

export const metadata: Metadata = { title: "Evidence policy" };

export default async function EvidencePolicyPage({
  params,
}: PageProps<"/org/[orgSlug]/settings/evidence">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const org = await getOrganization(ctx);
  return (
    <EvidencePolicyForm
      orgSlug={ctx.org.slug}
      readOnly={!can(ctx, "org.updateSettings")}
      requireIndependentEvidenceReview={org.requireIndependentEvidenceReview}
      defaultEvidenceValidityDays={org.defaultEvidenceValidityDays}
    />
  );
}
