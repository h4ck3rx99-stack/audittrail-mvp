import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentSession } from "@/server/auth/current";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

const LOOP = [
  {
    title: "Framework",
    body: "SOC 2 Trust Services Criteria as a requirement tree, scoped to the categories you choose.",
  },
  {
    title: "Controls",
    body: "Your safeguards, each owned by a person and mapped to the criteria it satisfies.",
  },
  {
    title: "Evidence",
    body: "Files and links that prove a control operates, matched to explicit evidence requirements.",
  },
  {
    title: "Reviews",
    body: "Evidence is approved or rejected by someone independent. Controls are reviewed on a schedule.",
  },
  {
    title: "Gaps",
    body: "Missing, expired or rejected evidence, unowned controls and overdue reviews are detected automatically.",
  },
  { title: "Tasks", body: "Assigned, dated work that closes each gap." },
  {
    title: "Resolution",
    body: "Tasks completed, risks mitigated or accepted with notes, evidence approved.",
  },
  {
    title: "Audit trail",
    body: "Every change is recorded as a hash-chained event: who, what, when, from where.",
  },
];

const QUESTIONS = [
  "How ready are we, and how is that number defined?",
  "Which controls are incomplete, and why?",
  "What evidence is required, what exists, and what is missing?",
  "Who owns each control, task and risk?",
  "What is overdue?",
  "What changed, who changed it, and when?",
];

export default async function LandingPage() {
  const session = await getCurrentSession();
  return (
    <div className="min-h-dvh">
      <header className="border-border border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Logo /> AuditTrail
          </Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/org">Open AuditTrail</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
          <p className="mono text-muted-foreground">SOC 2 audit readiness</p>
          <h1 className="mt-3 max-w-2xl text-3xl leading-tight font-semibold tracking-tight">
            One system of record for what your audit requires, what is done, and what is proven.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-[15px] leading-relaxed">
            AuditTrail replaces spreadsheets, scattered documents and evidence chasing with
            controls, owners, evidence requirements, reviews and detected gaps, all backed by a
            tamper-evident audit trail. It helps you prepare for an examination by an independent
            CPA firm; it does not certify anything on its own.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild variant="primary">
              <Link href="/signup">
                Create an account
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </section>

        <section className="border-border bg-subtle border-y">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <h2 className="text-sm font-semibold">The core loop</h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Every screen in AuditTrail is a view onto one of these stages.
            </p>
            <ol className="border-border bg-border mt-6 grid gap-px overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
              {LOOP.map((s, i) => (
                <li key={s.title} className="bg-background p-4">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className="mono border-border-strong text-muted-foreground flex size-5 items-center justify-center rounded-full border text-[11px]">
                      {i + 1}
                    </span>
                    {s.title}
                    {i < LOOP.length - 1 ? (
                      <ArrowRight className="text-faint-foreground ml-auto size-3.5" aria-hidden />
                    ) : null}
                  </p>
                  <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold">Questions it answers in seconds</h2>
            <ul className="text-muted-foreground mt-3 flex flex-col gap-2 text-[13px]">
              {QUESTIONS.map((q) => (
                <li key={q} className="border-border border-l-2 pl-3">
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Built to be trusted</h2>
            <ul className="text-muted-foreground mt-3 flex flex-col gap-2 text-[13px] leading-relaxed">
              <li>
                Readiness is an internal estimate with a visible definition, never a certification
                claim.
              </li>
              <li>
                Every mutation writes an audit event in the same database transaction, linked into a
                SHA-256 hash chain you can verify.
              </li>
              <li>
                Roles are enforced on the server for every read and write; organizations are
                strictly isolated.
              </li>
              <li>
                Evidence files are type-checked, stored privately and served only through
                authorized, audited downloads.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto max-w-5xl px-4 py-6 text-xs">
          AuditTrail · SOC 2 reports are attestations issued by independent CPA firms. AuditTrail
          helps you prepare; it does not issue reports or certifications.
        </div>
      </footer>
    </div>
  );
}
