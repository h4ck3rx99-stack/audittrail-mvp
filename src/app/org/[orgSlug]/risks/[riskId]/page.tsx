import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ListPlus } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { getRiskDetail } from "@/features/risks/server/queries";
import { getTaskFormOptions } from "@/features/tasks/server/queries";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { ActivityFeed } from "@/components/app/activity-feed";
import { ActionButton } from "@/components/app/actions";
import {
  DueDate,
  MetaList,
  PageHeader,
  Panel,
  Person,
  PlainText,
  SectionTitle,
  TimeAgo,
} from "@/components/app/primitives";
import { RISK_STATUS, SEVERITY, Status, StatusBadge, TASK_STATUS } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { EditRiskButton, RiskStatusForm } from "@/features/risks/components/risk-forms";
import { archiveRiskAction } from "@/features/risks/actions";
import { RISK_KIND_LABELS } from "@/features/risks/schemas";
import { riskKey, taskKey } from "@/lib/utils";

export const metadata: Metadata = { title: "Risk" };

export default async function RiskPage({ params }: PageProps<"/org/[orgSlug]/risks/[riskId]">) {
  const { orgSlug, riskId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const [d, options] = await Promise.all([getRiskDetail(ctx, riskId), getTaskFormOptions(ctx)]);
  const r = d.risk;
  const base = `/org/${ctx.org.slug}`;
  const links = await resolveResourceLinks(ctx, d.activity);
  const archived = r.archivedAt !== null;
  const key = riskKey(r.number);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="text-muted-foreground mb-2 text-xs">
        <Link href={`${base}/risks?tab=register`} className="hover:underline">
          Risk register
        </Link>{" "}
        / <span className="mono">{key}</span>
      </div>
      <PageHeader
        title={
          <span>
            <span className="mono text-muted-foreground mr-2 text-base">{key}</span>
            {r.title}
          </span>
        }
        meta={
          <>
            <Status map={RISK_STATUS} value={r.status} />
            <Status map={SEVERITY} value={r.severity} />
            <span>{RISK_KIND_LABELS[r.kind]}</span>
            {r.source === "DETECTED" ? <span>Tracks a detected gap</span> : null}
            {archived ? <StatusBadge tone="neutral" label="Archived" /> : null}
          </>
        }
        actions={
          <>
            {d.permissions.createTask && !archived ? (
              <Button asChild size="sm">
                <Link
                  href={`${base}/tasks?create=1&riskId=${r.id}&title=${encodeURIComponent(`Mitigate ${key}: ${r.title}`.slice(0, 200))}${r.controls.length ? `&controlId=${r.controls.map((c) => c.id).join(",")}` : ""}`}
                >
                  <ListPlus />
                  Mitigation task
                </Link>
              </Button>
            ) : null}
            {d.permissions.edit && !archived ? (
              <EditRiskButton
                orgSlug={ctx.org.slug}
                riskId={r.id}
                values={{
                  title: r.title,
                  description: r.description,
                  kind: r.kind,
                  severity: r.severity,
                  ownerId: r.ownerId,
                  dueDate: r.dueDate,
                  treatmentPlan: r.treatmentPlan,
                  controlIds: r.controls.map((c) => c.id),
                }}
                options={{ members: options.members, controls: options.controls }}
              />
            ) : null}
            {d.permissions.archive && !archived ? (
              <ActionButton
                size="sm"
                action={archiveRiskAction.bind(null, ctx.org.slug, r.id)}
                success="Risk archived"
                confirm={{
                  title: `Archive ${key}`,
                  confirmLabel: "Archive risk",
                  description:
                    "Archived risks leave the register and no longer appear as gaps. Nothing is deleted, and the risk stays in the audit trail.",
                }}
              >
                <Archive />
                Archive
              </ActionButton>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <SectionTitle>Description</SectionTitle>
            <PlainText
              text={r.description}
              className="text-[13px] leading-relaxed"
              empty="No description."
            />
          </section>
          <section>
            <SectionTitle>Treatment plan</SectionTitle>
            <PlainText
              text={r.treatmentPlan}
              className="text-[13px] leading-relaxed"
              empty="No treatment plan yet."
            />
          </section>
          {r.resolutionNotes ? (
            <section>
              <SectionTitle>Resolution notes</SectionTitle>
              <PlainText text={r.resolutionNotes} className="text-[13px] leading-relaxed" />
              {r.resolvedAt ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {r.resolvedBy?.name ?? "—"} ·{" "}
                  <TimeAgo date={r.resolvedAt} timeZone={ctx.org.timezone} />
                </p>
              ) : null}
            </section>
          ) : null}
          <section>
            <SectionTitle>Mitigation tasks</SectionTitle>
            {r.tasks.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">No tasks linked to this risk.</p>
            ) : (
              <ul className="border-border rounded-md border">
                {r.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="border-border flex items-center gap-3 border-b px-3 py-2 text-[13px] last:border-0"
                  >
                    <span className="mono text-muted-foreground w-16">{taskKey(t.number)}</span>
                    <Link
                      href={`${base}/tasks/${t.id}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {t.title}
                    </Link>
                    <Status map={TASK_STATUS} value={t.status} text />
                    <DueDate
                      date={t.dueDate}
                      today={d.today}
                      done={t.status === "DONE" || t.status === "CANCELED"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionTitle>Activity</SectionTitle>
            <ActivityFeed events={d.activity} links={links} timeZone={ctx.org.timezone} />
          </section>
        </div>
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <Panel className="p-4">
            <MetaList
              items={[
                {
                  label: "Status",
                  value:
                    d.permissions.edit && !archived ? (
                      <RiskStatusForm
                        key={r.status}
                        orgSlug={ctx.org.slug}
                        riskId={r.id}
                        status={r.status}
                        canAccept={d.permissions.accept}
                      />
                    ) : (
                      <span title={d.permissions.editReason ?? undefined}>
                        <Status map={RISK_STATUS} value={r.status} text />
                      </span>
                    ),
                },
                { label: "Severity", value: <Status map={SEVERITY} value={r.severity} text /> },
                { label: "Owner", value: <Person name={r.owner?.name} /> },
                {
                  label: "Due",
                  value: (
                    <DueDate
                      date={r.dueDate}
                      today={d.today}
                      done={!(r.status === "OPEN" || r.status === "IN_PROGRESS")}
                      empty="No due date"
                    />
                  ),
                },
                {
                  label: "Controls",
                  value:
                    r.controls.length === 0 ? (
                      <span className="text-faint-foreground">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.controls.map((c) => (
                          <Link
                            key={c.id}
                            href={`${base}/controls/${c.id}`}
                            className="mono border-border rounded-sm border px-1 text-[11px] hover:underline"
                            title={c.name}
                          >
                            {c.code}
                          </Link>
                        ))}
                      </div>
                    ),
                },
                { label: "Created by", value: <Person name={r.createdBy.name} /> },
                {
                  label: "Created",
                  value: <TimeAgo date={r.createdAt} timeZone={ctx.org.timezone} />,
                },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
