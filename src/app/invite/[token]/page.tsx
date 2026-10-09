import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSession } from "@/server/auth/current";
import { getInvitationByToken } from "@/features/members/server/service";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { AuthCard } from "@/components/app/auth-card";
import { Logo } from "@/components/app/logo";
import { AcceptInvitationButton } from "@/features/members/components/accept-invitation";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invitation, session] = await Promise.all([
    getInvitationByToken(token),
    getCurrentSession(),
  ]);
  const next = `/invite/${token}`;

  let body: React.ReactNode;
  if (!invitation || invitation.state !== "PENDING") {
    const reason =
      invitation?.state === "ACCEPTED"
        ? "This invitation has already been used."
        : invitation?.state === "REVOKED"
          ? "This invitation was revoked."
          : invitation?.state === "EXPIRED"
            ? "This invitation has expired."
            : "This invitation link is not valid.";
    body = (
      <AuthCard
        title="Invitation unavailable"
        description={`${reason} Ask an admin of the organization to send a new invitation.`}
      >
        <Link
          href={session ? "/org" : "/login"}
          className="text-accent text-[13px] hover:underline"
        >
          {session ? "Go to your organizations" : "Sign in"}
        </Link>
      </AuthCard>
    );
  } else {
    const title = `Join ${invitation.organization.name}`;
    const description = `${invitation.invitedBy.name} invited ${invitation.email} to join as ${ROLE_LABELS[invitation.role]}.`;
    if (!session) {
      body = (
        <AuthCard title={title} description={description}>
          <div className="flex flex-col gap-2">
            <Button asChild variant="primary">
              <Link
                href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`}
              >
                Create an account
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/login?next=${encodeURIComponent(next)}`}>
                I already have an account
              </Link>
            </Button>
          </div>
        </AuthCard>
      );
    } else if (session.user.email.toLowerCase() !== invitation.email) {
      body = (
        <AuthCard title={title} description={description}>
          <p className="text-muted-foreground text-[13px]">
            You are signed in as{" "}
            <span className="text-foreground font-medium">{session.user.email}</span>. This
            invitation is for{" "}
            <span className="text-foreground font-medium">{invitation.email}</span>. Sign out and
            sign in with that address to accept it.
          </p>
        </AuthCard>
      );
    } else {
      body = (
        <AuthCard title={title} description={description}>
          <AcceptInvitationButton token={token} />
        </AuthCard>
      );
    }
  }

  return (
    <div className="bg-subtle flex min-h-dvh flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <Logo /> AuditTrail
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">
        <div className="w-full max-w-sm">{body}</div>
      </main>
    </div>
  );
}
