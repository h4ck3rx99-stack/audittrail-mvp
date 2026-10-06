import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/app/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token) {
    return (
      <AuthCard title="Reset link missing" description="Open the link from your email, or request a new one.">
        <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
