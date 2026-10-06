import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { suggestNextControlCode } from "@/features/controls/server/service";
import { loadFrameworks } from "@/features/readiness/server/snapshot";
import { listMemberOptions } from "@/features/members/server/service";
import { PageHeader } from "@/components/app/primitives";
import { CreateControlForm } from "@/features/controls/components/create-control-form";

export const metadata: Metadata = { title: "New control" };

export default async function NewControlPage({ params }: PageProps<"/org/[orgSlug]/controls/new">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "control.manage")) notFound();
  const [code, frameworks, members] = await Promise.all([suggestNextControlCode(ctx), loadFrameworks(ctx.org.id), listMemberOptions(ctx)]);

  const requirements = frameworks.flatMap((f) => {
    const byId = new Map(f.requirements.map((r) => [r.id, r]));
    return f.requirements
      .filter((r) => r.kind === "REQUIREMENT")
      .map((r) => {
        const parent = r.parentId ? byId.get(r.parentId) : undefined;
        return { id: r.id, code: r.code, title: r.title, group: `${f.name} · ${parent ? `${parent.code} ${parent.title}` : ""}` };
      });
  });

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="New control" description="Create a custom control and map it to the criteria it satisfies. You can add evidence requirements after creating it." />
      <CreateControlForm orgSlug={ctx.org.slug} suggestedCode={code} requirements={requirements} members={members.map((m) => ({ id: m.id, name: m.name }))} />
    </div>
  );
}
