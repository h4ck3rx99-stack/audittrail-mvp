import Link from "next/link";
import { requireUserContext } from "@/server/authz/context";
import { Logo } from "@/components/app/logo";
import { SettingsNav } from "@/components/app/settings-nav";
import { logoutAction } from "@/features/auth/actions";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserContext();
  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <Link href="/org" className="inline-flex items-center gap-2 text-sm font-semibold">
          <Logo /> AuditTrail
        </Link>
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">{ctx.user.email}</span>
          <form action={logoutAction}>
            <button className="text-muted-foreground hover:text-foreground">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[900px] px-4 py-6">
        <Link href="/org" className="text-xs text-muted-foreground hover:underline">
          ← Back to your organization
        </Link>
        <h1 className="mt-2 mb-4 text-xl font-semibold">Account</h1>
        <SettingsNav
          items={[
            { href: "/account", label: "Profile" },
            { href: "/account/security", label: "Security" },
          ]}
        />
        {children}
      </main>
    </div>
  );
}
