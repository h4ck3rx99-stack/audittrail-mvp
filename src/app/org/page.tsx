import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserContext } from "@/server/authz/context";
import { LAST_ORG_COOKIE } from "@/server/auth/cookies";
import { listMyOrganizations } from "@/features/organizations/server/service";
import { listMyPendingInvitations } from "@/features/members/server/service";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { Logo } from "@/components/app/logo";
import { PendingInvitations } from "@/features/members/components/pending-invitations";
import { logoutAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrgPickerPage({ searchParams }: PageProps<"/org">) {
  const sp = await searchParams;
  const ctx = await requireUserContext();
  const [orgs, invitations] = await Promise.all([listMyOrganizations(ctx.user.id), listMyPendingInvitations(ctx)]);
  const showPicker = sp.view === "invitations" || sp.view === "all";

  if (!showPicker) {
    const last = (await cookies()).get(LAST_ORG_COOKIE)?.value;
    const target = orgs.find((o) => o.slug === last) ?? (orgs.length === 1 ? orgs[0] : undefined);
    if (target && invitations.length === 0) redirect(`/org/${target.slug}/dashboard`);
    if (orgs.length === 0 && invitations.length === 0) redirect("/onboarding");
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Logo /> AuditTrail
        </span>
        <form action={logoutAction}>
          <button className="text-[13px] text-muted-foreground hover:text-foreground">Sign out</button>
        </form>
      </div>
      {invitations.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <PendingInvitations invitations={invitations.map((i) => ({ id: i.id, orgName: i.organization.name, role: ROLE_LABELS[i.role], inviter: i.invitedBy.name }))} />
        </section>
      ) : null}
      <h1 className="mb-2 text-sm font-semibold">Your organizations</h1>
      {orgs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">You are not a member of any organization yet.</p>
      ) : (
        <ul className="rounded-md border border-border">
          {orgs.map((o) => (
            <li key={o.id} className="border-b border-border last:border-0">
              <Link href={`/org/${o.slug}/dashboard`} className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-hover">
                <span className="font-medium">
                  {o.name}
                  {o.isDemo ? <span className="ml-2 text-xs font-normal text-muted-foreground">Demo</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[o.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/onboarding?new=1" className="mt-4 inline-block text-[13px] text-accent hover:underline">
        Create a new organization
      </Link>
    </main>
  );
}
