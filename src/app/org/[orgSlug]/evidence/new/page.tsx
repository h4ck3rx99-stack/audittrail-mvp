import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { isUuid } from "@/server/ids";
import { listLinkTargets } from "@/features/evidence/server/queries";
import { ACCEPT_ATTRIBUTE } from "@/server/files/detect";
import { PageHeader } from "@/components/app/primitives";
import { UploadEvidenceForm } from "@/features/evidence/components/upload-form";
import { todayInTimeZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Upload evidence" };

export default async function NewEvidencePage({ params, searchParams }: PageProps<"/org/[orgSlug]/evidence/new">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "evidence.contribute")) notFound();
  const targets = await listLinkTargets(ctx);

  const controlId = typeof sp.controlId === "string" && isUuid(sp.controlId) ? sp.controlId : null;
  const requirementId = typeof sp.requirementId === "string" && isUuid(sp.requirementId) ? sp.requirementId : null;
  const control = controlId ? targets.find((t) => t.id === controlId) : undefined;
  const initialLink = control
    ? { controlId: control.id, evidenceRequirementId: requirementId && control.evidenceRequirements.some((r) => r.id === requirementId) ? requirementId : null }
    : null;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Upload evidence" description="Files are type-checked against their contents, hashed (SHA-256) and stored privately. New evidence starts as pending review." />
      <UploadEvidenceForm
        orgSlug={ctx.org.slug}
        targets={targets}
        initialLink={initialLink}
        maxMb={env.MAX_UPLOAD_MB}
        accept={ACCEPT_ATTRIBUTE}
        today={todayInTimeZone(ctx.org.timezone)}
      />
    </div>
  );
}
