import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { AuthCard } from "@/components/app/auth-card";
import { SignUpForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = safeRedirectPath(sp.next, "/onboarding");
  if (await getCurrentSession()) redirect(next);
  const email = typeof sp.email === "string" && sp.email.length <= 254 ? sp.email : undefined;
  return (
    <AuthCard
      title="Create your account"
      description="Set up audit readiness for your organization."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-accent hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} defaultEmail={email} />
    </AuthCard>
  );
}
