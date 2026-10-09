import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { AuthCard } from "@/components/app/auth-card";
import { LoginForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeRedirectPath(sp.next, "/org");
  if (await getCurrentSession()) redirect(next);
  return (
    <AuthCard
      title="Sign in to AuditTrail"
      description={sp.reset ? "Your password was reset. Sign in with the new password." : undefined}
      footer={
        <>
          No account yet?{" "}
          <Link
            href={`/signup${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-accent hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
