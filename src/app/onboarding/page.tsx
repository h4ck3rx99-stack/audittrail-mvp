import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserContext } from "@/server/authz/context";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { listCatalogFrameworks } from "@/features/frameworks/server/service";
import { listMyOrganizations } from "@/features/organizations/server/service";
import { listMyPendingInvitations } from "@/features/members/server/service";
import { OnboardingWizard } from "@/features/organizations/components/onboarding-wizard";
import { PendingInvitations } from "@/features/members/components/pending-invitations";
import { Logo } from "@/components/app/logo";

export const metadata: Metadata = { title: "Set up your organization" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const ctx = await requireUserContext();
  const [frameworks, orgs, invitations] = await Promise.all([listCatalogFrameworks(), listMyOrganizations(ctx.user.id), listMyPendingInvitations(ctx)]);
  if (orgs.length > 0 && sp.new !== "1" && invitations.length === 0) redirect("/org");

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Logo /> AuditTrail
        </span>
        {orgs.length > 0 ? (
          <Link href="/org?view=all" className="text-[13px] text-muted-foreground hover:text-foreground">
            Your organizations
          </Link>
        ) : null}
      </div>
      {invitations.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-sm font-semibold">You have been invited</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Join an existing organization instead of creating a new one.</p>
          <PendingInvitations invitations={invitations.map((i) => ({ id: i.id, orgName: i.organization.name, role: ROLE_LABELS[i.role], inviter: i.invitedBy.name }))} />
        </section>
      ) : null}
      <h1 className="text-xl font-semibold">Set up your organization</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted-foreground">Three short steps. You can change everything later in Settings.</p>
      <OnboardingWizard
        timezone="UTC"
        frameworks={frameworks.map((f) => ({
          key: f.key,
          name: f.name,
          description: f.description,
          requirementLabel: f.requirementLabel,
          templateCount: f._count.controlTemplates,
          categories: f.requirements,
        }))}
      />
    </main>
  );
}
