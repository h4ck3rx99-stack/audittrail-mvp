import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/app/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email. If it exists, we will send a single-use link that expires in 30 minutes."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
