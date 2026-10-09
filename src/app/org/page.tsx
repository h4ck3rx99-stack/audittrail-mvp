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
  const [orgs, invitations] = await Promise.all([
    listMyOrganizations(ctx.user.id),
    listMyPendingInvitations(ctx),
  ]);
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
          <button className="text-muted-foreground hover:text-foreground text-[13px]">
            Sign out
          </button>
        </form>
      </div>
      {invitations.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <PendingInvitations
            invitations={invitations.map((i) => ({
              id: i.id,
              orgName: i.organization.name,
              role: ROLE_LABELS[i.role],
              inviter: i.invitedBy.name,
            }))}
          />
        </section>
      ) : null}
      <h1 className="mb-2 text-sm font-semibold">Your organizations</h1>
      {orgs.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          You are not a member of any organization yet.
        </p>
      ) : (
        <ul className="border-border rounded-md border">
          {orgs.map((o) => (
            <li key={o.id} className="border-border border-b last:border-0">
              <Link
                href={`/org/${o.slug}/dashboard`}
                className="hover:bg-hover flex items-center justify-between px-4 py-3 text-[13px]"
              >
                <span className="font-medium">
                  {o.name}
                  {o.isDemo ? (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">Demo</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">{ROLE_LABELS[o.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/onboarding?new=1"
        className="text-accent mt-4 inline-block text-[13px] hover:underline"
      >
        Create a new organization
      </Link>
    </main>
  );
}
