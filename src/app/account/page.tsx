import type { Metadata } from "next";
import { requireUserContext } from "@/server/authz/context";
import { ProfileForm } from "@/features/auth/components/account-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountPage() {
  const ctx = await requireUserContext();
  return <ProfileForm name={ctx.user.name} email={ctx.user.email} />;
}
