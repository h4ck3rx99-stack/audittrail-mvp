import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { getDashboard } from "@/features/dashboard/server/queries";
import { ActivityFeed } from "@/components/app/activity-feed";
import { ReadinessDefinition } from "@/components/app/definition";
import {
  DueDate,
  EmptyState,
  Meter,
  PageHeader,
  Panel,
  SectionTitle,
} from "@/components/app/primitives";
import { CONTROL_STATUS, Dot, PRIORITY, SEVERITY, Status } from "@/components/app/status";
import { diffDays, formatDateOnly } from "@/lib/dates";
import { cn, taskKey } from "@/lib/utils";
import { AUDIT_TYPE_LABELS } from "@/features/organizations/schemas";

export const metadata: Metadata = { title: "Dashboard" };

function Metric({
  label,
  value,
  detail,
  href,
  danger,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link href={href} className="group hover:bg-hover flex min-w-0 flex-col gap-1 px-4 py-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          "text-[28px] leading-8 font-semibold tracking-tight tabular-nums",
          danger && "text-danger",
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs">{detail}</span>
    </Link>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default async function DashboardPage({
  params,
  searchParams,
}: PageProps<"/org/[orgSlug]/dashboard">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const data = await getDashboard(ctx, typeof sp.framework === "string" ? sp.framework : undefined);
  const base = `/org/${ctx.org.slug}`;
  const r = data.readiness;
  const countdown = data.org.targetAuditDate
    ? diffDays(data.today, data.org.targetAuditDate)
    : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={data.org.name}
        meta={
          <>
            {data.frameworks.length > 1 ? (
              <span className="flex gap-1">
                {data.frameworks.map((f) => (
                  <Link
                    key={f.key}
                    href={`${base}/dashboard?framework=${f.key}`}
                    className={cn(
                      "rounded-sm border px-1.5 text-xs",
                      f.key === data.framework?.key ? "border-accent" : "border-border",
                    )}
                  >
                    {f.name}
                  </Link>
                ))}
              </span>
            ) : data.framework ? (
              <span className="border-border text-foreground rounded-sm border px-1.5 text-xs">
                {data.framework.name}
              </span>
            ) : null}
            <span>{AUDIT_TYPE_LABELS[data.org.auditType]}</span>
            {data.org.targetAuditDate && countdown !== null ? (
              <span title={formatDateOnly(data.org.targetAuditDate)}>
                Target audit {formatDateOnly(data.org.targetAuditDate)} ·{" "}
                <span className={cn(countdown < 0 && "text-danger")}>
                  {countdown >= 0 ? `${countdown} days left` : `${-countdown} days ago`}
                </span>
              </span>
            ) : null}
            <ReadinessDefinition />
          </>
        }
      />

      {!data.framework ? (
        <EmptyState
          title="No framework adopted yet"
          description="Adopt SOC 2 to create your requirement tree and, optionally, a starter set of controls."
          action={
            <Link
              className="text-accent text-[13px] hover:underline"
              href={`${base}/settings/frameworks`}
            >
              Adopt a framework
            </Link>
          }
        />
      ) : (
        <>
          <Panel className="divide-border [&>*]:border-border mb-5 grid grid-cols-2 md:grid-cols-5 md:divide-x [&>*]:border-b md:[&>*]:border-b-0">
            <Metric
              label="Readiness"
              value={pct(r?.readiness.pct ?? null)}
              detail={`${r?.readiness.numerator ?? 0} of ${r?.readiness.denominator ?? 0} controls ready`}
              href={`${base}/controls?health=READY`}
            />
            <Metric
              label="Evidence coverage"
              value={pct(r?.evidenceCoverage.pct ?? null)}
              detail={`${r?.missingRequiredEvidence ?? 0} requirements missing`}
              href={`${base}/evidence?tab=missing`}
            />
            <Metric
              label="Open tasks"
              value={String(data.metrics.openTasks)}
              detail={
                <span className={cn(data.metrics.overdueTasks > 0 && "text-danger")}>
                  {data.metrics.overdueTasks} overdue
                </span>
              }
              href={`${base}/tasks?view=all&status=open`}
            />
            <Metric
              label="Open risks"
              value={String(data.metrics.openRisks)}
              detail={`${data.metrics.risks.CRITICAL} critical · ${data.metrics.risks.HIGH} high · ${data.metrics.risks.MEDIUM} medium · ${data.metrics.risks.LOW} low`}
              href={`${base}/risks?tab=register&status=active`}
            />
            <Metric
              label="Reviews overdue"
              value={String(data.metrics.reviewsOverdue)}
              detail="Control reviews past due"
              href={`${base}/controls?overdue=1`}
              danger={data.metrics.reviewsOverdue > 0}
            />
          </Panel>

          {data.showChecklist ? (
            <Panel className="mb-5 p-4">
              <SectionTitle>Getting started</SectionTitle>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
                {data.checklist.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={c.href}
                      className="hover:bg-hover flex items-center gap-2 rounded-sm px-1 py-1 text-[13px]"
                    >
                      {c.done ? (
                        <CheckCircle2 className="text-success size-4" aria-hidden />
                      ) : (
                        <Circle className="text-faint-foreground size-4" aria-hidden />
                      )}
                      <span className={cn(c.done && "text-muted-foreground line-through")}>
                        {c.label}
                      </span>
                      <span className="sr-only">{c.done ? "(done)" : "(to do)"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <Panel className="p-4">
                <SectionTitle
                  action={
                    <Link
                      href={`${base}/frameworks/${data.framework.key}`}
                      className="text-accent text-xs hover:underline"
                    >
                      Framework view
                    </Link>
                  }
                >
                  Readiness by category
                </SectionTitle>
                <div className="flex flex-col gap-3">
                  {[...(r?.categories ?? []), ...(r?.series ?? [])].map((row, i) => (
                    <Link
                      key={row.requirementId}
                      href={`${base}/controls?group=${encodeURIComponent(row.code)}`}
                      className={cn(
                        "hover:bg-hover grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 rounded-sm px-1 py-0.5",
                        i === (r?.categories.length ?? 0) && "border-border mt-2 border-t pt-3",
                      )}
                    >
                      <span className="truncate text-[13px]">
                        <span className="mono text-muted-foreground mr-1.5">{row.code}</span>
                        {row.title}
                      </span>
                      <Meter value={row.score.pct} label={`${row.title} readiness`} />
                      <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
                        {pct(row.score.pct)} · {row.ready}/{row.applicable}
                      </span>
                    </Link>
                  ))}
                </div>
                {r ? (
                  <div className="mt-5">
                    <p className="text-muted-foreground mb-2 text-xs">Control status</p>
                    <StatusBar distribution={r.statusDistribution} base={base} />
                  </div>
                ) : null}
              </Panel>

              <Panel className="p-4">
                <SectionTitle
                  action={
                    <Link
                      href={`${base}/risks?tab=gaps`}
                      className="text-accent text-xs hover:underline"
                    >
                      View all {data.gapCount}
                    </Link>
                  }
                >
                  Needs attention
                </SectionTitle>
                {data.gaps.length === 0 ? (
                  <p className="text-muted-foreground py-3 text-[13px]">
                    No detected gaps. Everything in scope is owned, evidenced and reviewed on time.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {data.gaps.map((g) => (
                      <li
                        key={g.key}
                        className="border-border flex items-center gap-3 border-b py-2 last:border-0"
                      >
                        <Status map={SEVERITY} value={g.severity} />
                        <Link
                          href={`${base}${g.link}`}
                          className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                        >
                          {g.title}
                        </Link>
                        <span className="text-muted-foreground hidden text-xs sm:inline">
                          {g.suggestedAction}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="flex flex-col gap-5">
              <Panel className="p-4">
                <SectionTitle>My work</SectionTitle>
                <WorkList
                  title="My open tasks"
                  empty="No open tasks assigned to you."
                  href={`${base}/tasks`}
                >
                  {data.myWork.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <Dot tone={PRIORITY[t.priority]!.tone} />
                      <Link
                        href={`${base}/tasks/${t.id}`}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        <span className="mono text-muted-foreground mr-1">{taskKey(t.number)}</span>
                        {t.title}
                      </Link>
                      <span className="text-xs">
                        <DueDate date={t.dueDate} today={data.today} />
                      </span>
                    </li>
                  ))}
                </WorkList>
                <WorkList
                  title="My controls due for review"
                  empty="None due in the next 14 days."
                  href={`${base}/controls?owner=me`}
                >
                  {data.myWork.reviews.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <Link
                        href={`${base}/controls/${c.id}?tab=reviews`}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        <span className="mono text-muted-foreground mr-1">{c.code}</span>
                        {c.name}
                      </Link>
                      <span className="text-xs">
                        <DueDate date={c.nextReviewDate} today={data.today} />
                      </span>
                    </li>
                  ))}
                </WorkList>
                {data.myWork.isManager ? (
                  <WorkList
                    title="Evidence awaiting review"
                    empty="Nothing waiting for review."
                    href={`${base}/evidence?tab=review`}
                  >
                    {data.myWork.awaitingReview.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                        <Link
                          href={`${base}/evidence/${e.id}`}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {e.title}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {e.mine ? "Your upload" : e.uploadedBy}
                        </span>
                      </li>
                    ))}
                  </WorkList>
                ) : null}
                <WorkList
                  title="My rejected evidence"
                  empty="None of your evidence is rejected."
                  href={`${base}/evidence?status=REJECTED&uploader=me`}
                >
                  {data.myWork.rejected.map((e) => (
                    <li key={e.id} className="py-1.5 text-[13px]">
                      <Link
                        href={`${base}/evidence/${e.id}`}
                        className="block truncate hover:underline"
                      >
                        {e.title}
                      </Link>
                      {e.reviewComment ? (
                        <p className="text-muted-foreground truncate text-xs">{e.reviewComment}</p>
                      ) : null}
                    </li>
                  ))}
                </WorkList>
              </Panel>

              <Panel className="p-4">
                <SectionTitle
                  action={
                    <Link
                      href={`${base}/audit-log`}
                      className="text-accent text-xs hover:underline"
                    >
                      Audit log
                    </Link>
                  }
                >
                  Recent activity
                </SectionTitle>
                <ActivityFeed
                  events={data.activity}
                  links={data.activityLinks}
                  timeZone={ctx.org.timezone}
                />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function WorkList({
  title,
  empty,
  href,
  children,
}: {
  title: string;
  empty: string;
  href: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{title}</p>
        <Link href={href} className="text-accent text-xs hover:underline">
          View
        </Link>
      </div>
      {children.length === 0 ? (
        <p className="text-faint-foreground py-1 text-[13px]">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

function StatusBar({ distribution, base }: { distribution: Record<string, number>; base: string }) {
  const order = ["IMPLEMENTED", "IN_PROGRESS", "NOT_STARTED", "NOT_APPLICABLE"] as const;
  const total = order.reduce((s, k) => s + (distribution[k] ?? 0), 0);
  const color: Record<(typeof order)[number], string> = {
    IMPLEMENTED: "bg-success",
    IN_PROGRESS: "bg-info",
    NOT_STARTED: "bg-border-strong",
    NOT_APPLICABLE: "bg-neutral",
  };
  if (total === 0) return <p className="text-muted-foreground text-[13px]">No controls yet.</p>;
  return (
    <div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label="Control status distribution"
      >
        {order.map((k) =>
          distribution[k] ? (
            <div
              key={k}
              className={color[k]}
              style={{ width: `${((distribution[k] ?? 0) / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {order.map((k) => (
          <li key={k}>
            <Link
              href={`${base}/controls?status=${k}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <span className={cn("size-2 rounded-full", color[k])} aria-hidden />
              {CONTROL_STATUS[k]!.label}
              <span className="text-muted-foreground tabular-nums">{distribution[k] ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
