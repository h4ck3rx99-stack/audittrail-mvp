import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { isUuid } from "@/server/ids";
import { getTaskFormOptions } from "@/features/tasks/server/queries";
import { CreateRiskForm } from "@/features/risks/components/risk-forms";
import { PageHeader } from "@/components/app/primitives";

export const metadata: Metadata = { title: "New risk" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NewRiskPage({ params, searchParams }: PageProps<"/org/[orgSlug]/risks/new">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "risk.create")) notFound();
  const options = await getTaskFormOptions(ctx);
  const gapKey = first(sp.gapKey)?.slice(0, 120);
  const controlIds = (first(sp.controlId) ?? "").split(",").filter(isUuid).slice(0, 20);
  const severity = first(sp.severity);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="New risk"
        description={gapKey ? "Tracking a detected gap as a risk gives it an owner, a due date and a treatment plan." : "Record a risk to the security program and how it will be treated."}
      />
      <CreateRiskForm
        orgSlug={ctx.org.slug}
        options={{ members: options.members, controls: options.controls }}
        prefill={{
          gapKey,
          title: first(sp.title)?.slice(0, 200),
          description: first(sp.description)?.slice(0, 2000),
          kind: gapKey ? "GAP" : "RISK",
          severity: severity && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity) ? severity : "MEDIUM",
          controlIds,
        }}
      />
    </div>
  );
}
