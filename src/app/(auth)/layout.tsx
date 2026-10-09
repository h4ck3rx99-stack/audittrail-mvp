import Link from "next/link";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-subtle flex min-h-dvh flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <Logo />
          AuditTrail
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
