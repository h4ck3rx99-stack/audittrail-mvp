import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ListPlus, RotateCcw, ShieldPlus } from "lucide-react";
import { requireOrgContext } from "@/server/authz/context";
import { getControlDetail } from "@/features/controls/server/queries";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { ActivityFeed } from "@/components/app/activity-feed";
import { DueDate, EmptyState, MetaList, PageHeader, Panel, Person, PlainText, SectionTitle, TabLinks, TimeAgo, Table, TableWrap, Td, Th, THead, Tr } from "@/components/app/primitives";
import { CONTROL_STATUS, EVIDENCE_STATUS, FRESHNESS, HEALTH, PRIORITY, REQUIREMENT_STATE, RISK_STATUS, SEVERITY, Status, TASK_STATUS, StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import {
  ArchiveRequirementButton,
  EditDefinitionButton,
  EvidenceRequirementDialog,
  LinkExistingDialog,
  MapRequirementForm,
  NextReviewEditor,
  NotesForm,
  OwnerSelect,
  RecordReviewForm,
  StatusEditor,
  UnlinkButton,
  UploadForRequirementLink,
} from "@/features/controls/components/control-forms";
import { archiveControlAction, restoreControlAction, unmapRequirementAction } from "@/features/controls/actions";
import { REVIEW_FREQUENCY_LABELS, REVIEW_OUTCOME_LABELS } from "@/features/controls/schemas";
import { formatDateOnly, formatTimestamp } from "@/lib/dates";
import { riskKey, taskKey } from "@/lib/utils";

export const metadata: Metadata = { title: "Control" };

const TABS = ["overview", "evidence", "requirements", "reviews", "work", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function ControlPage({ params, searchParams }: PageProps<"/org/[orgSlug]/controls/[controlId]">) {
  const { orgSlug, controlId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const d = await getControlDetail(ctx, controlId);
  const c = d.control;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "overview";
  const base = `/org/${ctx.org.slug}`;
  const href = (t: Tab) => `${base}/controls/${c.id}${t === "overview" ? "" : `?tab=${t}`}`;
  const archived = c.archivedAt !== null;
  const ids = { orgSlug: ctx.org.slug, controlId: c.id, version: c.version };
  const activityLinks = tab === "activity" ? await resolveResourceLinks(ctx, d.activity) : undefined;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-2 text-xs text-muted-foreground">
        <Link href={`${base}/controls`} className="hover:underline">
          Controls
        </Link>{" "}
        / <span className="mono">{c.code}</span>
      </div>
      <PageHeader
        title={
          <span>
            <span className="mono mr-2 text-base text-muted-foreground">{c.code}</span>
            {c.name}
          </span>
        }
        meta={
          <>
            <Status map={CONTROL_STATUS} value={c.status} />
            <Status map={HEALTH} value={d.health ?? "NA"} />
            {!d.applicable && !archived ? <StatusBadge tone="muted" label="Not counted toward readiness" title="Not mapped to any in-scope criterion, or marked not applicable." /> : null}
            {archived ? <StatusBadge tone="neutral" label="Archived" /> : null}
            <span>
              Evidence {d.evidenceProgress.satisfied}/{d.evidenceProgress.total} required
            </span>
          </>
        }
        actions={
          <>
            {d.permissions.createTask && !archived ? (
              <Button asChild size="sm">
                <Link href={`${base}/tasks?create=1&controlId=${c.id}`}>
                  <ListPlus />
                  Create task
                </Link>
              </Button>
            ) : null}
            {d.permissions.createRisk && !archived ? (
              <Button asChild size="sm">
                <Link href={`${base}/risks/new?controlId=${c.id}`}>
                  <ShieldPlus />
                  Create risk
                </Link>
              </Button>
            ) : null}
            {d.permissions.manage && !archived ? <EditDefinitionButton {...ids} control={c} /> : null}
            {d.permissions.manage ? (
              archived ? (
                <ActionButton size="sm" action={restoreControlAction.bind(null, ctx.org.slug, c.id)} success="Control restored">
                  <RotateCcw />
                  Restore
                </ActionButton>
              ) : (
                <ActionButton
                  size="sm"
                  action={archiveControlAction.bind(null, ctx.org.slug, c.id)}
                  success="Control archived"
                  confirm={{
                    title: `Archive ${c.code}`,
                    description:
                      "Archived controls stop counting toward readiness and gaps, and can no longer be edited. Nothing is deleted: evidence, reviews and history are kept, and you can restore the control at any time.",
                    confirmLabel: "Archive control",
                  }}
                >
                  <Archive />
                  Archive
                </ActionButton>
              )
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <TabLinks
            tabs={[
              { href: href("overview"), label: "Overview", active: tab === "overview" },
              { href: href("evidence"), label: `Evidence ${d.evidenceProgress.satisfied}/${d.evidenceProgress.total}`, active: tab === "evidence" },
              { href: href("requirements"), label: `Requirements ${d.requirements.length}`, active: tab === "requirements" },
              { href: href("reviews"), label: `Reviews ${c.reviews.length}`, active: tab === "reviews" },
              { href: href("work"), label: `Tasks & risks ${d.tasks.length + d.risks.length}`, active: tab === "work" },
              { href: href("activity"), label: "Activity", active: tab === "activity" },
            ]}
          />

          {tab === "overview" ? (
            <div className="flex flex-col gap-6">
              <section>
                <SectionTitle>Description</SectionTitle>
                <PlainText text={c.description} className="text-[13px] leading-relaxed" />
              </section>
              {c.template ? (
                <section>
                  <SectionTitle>Implementation guidance</SectionTitle>
                  <PlainText text={c.template.guidance} className="text-[13px] leading-relaxed text-muted-foreground" />
                </section>
              ) : null}
              <section>
                {d.permissions.updateStatus && !archived ? (
                  <NotesForm {...ids} implementationNotes={c.implementationNotes} notes={c.notes} />
                ) : (
                  <>
                    <SectionTitle>Implementation notes</SectionTitle>
                    <PlainText text={c.implementationNotes} className="text-[13px] leading-relaxed" />
                    <SectionTitle className="mt-5">Notes</SectionTitle>
                    <PlainText text={c.notes} className="text-[13px] leading-relaxed" />
                  </>
                )}
              </section>
            </div>
          ) : null}

          {tab === "evidence" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-muted-foreground">What is required, what exists, and what is missing for this control.</p>
                {d.permissions.manage && !archived ? <EvidenceRequirementDialog orgSlug={ctx.org.slug} controlId={c.id} /> : null}
              </div>
              {d.evidenceRequirements.length === 0 ? (
                <EmptyState title="No evidence requirements" description="Add the proof an auditor should see for this control, for example a configuration export or a signed review." />
              ) : (
                d.evidenceRequirements.map((r) => (
                  <Panel key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-medium">{r.title}</p>
                          <Status map={REQUIREMENT_STATE} value={r.state} />
                          {!r.isRequired ? <StatusBadge tone="muted" label="Optional" /> : null}
                        </div>
                        {r.description ? <p className="mt-1 text-xs text-muted-foreground">{r.description}</p> : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fresh for {r.freshnessDays} days after collection
                          {r.bestValidUntil ? ` · valid until ${formatDateOnly(r.bestValidUntil)}` : ""}
                        </p>
                        {r.state === "REJECTED" && r.rejectedComment ? (
                          <p className="mt-1 text-xs text-danger">Reviewer: {r.rejectedComment}</p>
                        ) : null}
                      </div>
                      {!archived ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {d.permissions.contributeEvidence ? (
                            <>
                              <UploadForRequirementLink orgSlug={ctx.org.slug} controlId={c.id} requirementId={r.id} />
                              <LinkExistingDialog orgSlug={ctx.org.slug} controlId={c.id} requirementId={r.id} library={d.evidenceLibrary} alreadyLinked={r.links.map((l) => l.evidenceId)} />
                            </>
                          ) : null}
                          {d.permissions.manage ? (
                            <>
                              <EvidenceRequirementDialog orgSlug={ctx.org.slug} controlId={c.id} requirement={r} />
                              <ArchiveRequirementButton orgSlug={ctx.org.slug} requirementId={r.id} title={r.title} />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {r.links.length > 0 ? (
                      <ul className="mt-3 border-t border-border">
                        {r.links.map((l) => (
                          <li key={l.linkId} className="flex flex-wrap items-center gap-3 border-b border-border py-2 text-[13px] last:border-0">
                            <Link href={`${base}/evidence/${l.evidenceId}`} className="min-w-0 flex-1 truncate hover:underline">
                              {l.title}
                            </Link>
                            <Status map={EVIDENCE_STATUS} value={l.status} text />
                            {l.status === "APPROVED" ? <Status map={FRESHNESS} value={l.freshness} text /> : null}
                            {d.permissions.contributeEvidence && !archived ? <UnlinkButton orgSlug={ctx.org.slug} linkId={l.linkId} label={l.title} /> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Panel>
                ))
              )}
              {d.generalEvidence.length > 0 ? (
                <Panel className="p-4">
                  <SectionTitle>Other linked evidence</SectionTitle>
                  <p className="mb-2 text-xs text-muted-foreground">Linked to the control without a specific requirement; it does not satisfy a requirement on its own.</p>
                  <ul>
                    {d.generalEvidence.map((e) => (
                      <li key={e.linkId} className="flex items-center gap-3 border-b border-border py-2 text-[13px] last:border-0">
                        <Link href={`${base}/evidence/${e.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {e.title}
                        </Link>
                        <Status map={EVIDENCE_STATUS} value={e.status} text />
                        {d.permissions.contributeEvidence && !archived ? <UnlinkButton orgSlug={ctx.org.slug} linkId={e.linkId} label={e.title} /> : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === "requirements" ? (
            <div className="flex flex-col gap-4">
              {d.permissions.manage && !archived ? (
                <MapRequirementForm
                  orgSlug={ctx.org.slug}
                  controlId={c.id}
                  options={d.frameworkRequirements
                    .filter((r) => !d.requirements.some((m) => m.id === r.id))
                    .map((r) => ({ id: r.id, code: r.code, title: r.title, framework: r.framework.name }))}
                />
              ) : null}
              {d.requirements.length === 0 ? (
                <EmptyState title="Not mapped to any requirement" description="Map this control to the criteria it satisfies so it counts toward readiness." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <Th className="w-24">Code</Th>
                        <Th>Requirement</Th>
                        <Th>Framework</Th>
                        <Th>Scope</Th>
                        {d.permissions.manage && !archived ? <Th className="w-20" /> : null}
                      </tr>
                    </THead>
                    <tbody>
                      {d.requirements.map((r) => (
                        <Tr key={r.id}>
                          <Td className="mono">{r.code}</Td>
                          <Td>
                            <Link href={`${base}/frameworks/${r.framework.key}?focus=${encodeURIComponent(r.code)}`} className="font-medium hover:underline">
                              {r.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">{r.summary}</p>
                          </Td>
                          <Td className="whitespace-nowrap">{r.framework.name}</Td>
                          <Td>{r.inScope ? <StatusBadge tone="success" label="In scope" /> : <StatusBadge tone="muted" label="Out of scope" />}</Td>
                          {d.permissions.manage && !archived ? (
                            <Td>
                              <ActionButton
                                size="sm"
                                variant="ghost"
                                action={unmapRequirementAction.bind(null, ctx.org.slug, c.id, r.id)}
                                success={`Unmapped ${r.code}`}
                                confirm={{ title: `Unmap ${r.code}`, description: `${c.code} will no longer count toward ${r.code}.`, confirmLabel: "Unmap" }}
                              >
                                Unmap
                              </ActionButton>
                            </Td>
                          ) : null}
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
          ) : null}

          {tab === "reviews" ? (
            <div className="flex flex-col gap-4">
              {d.permissions.review && !archived ? (
                <RecordReviewForm orgSlug={ctx.org.slug} controlId={c.id} today={d.today} frequency={c.reviewFrequency} />
              ) : d.permissions.reviewReason && !archived ? (
                <p className="text-[13px] text-muted-foreground">{d.permissions.reviewReason}</p>
              ) : null}
              {c.reviews.length === 0 ? (
                <EmptyState title="No reviews recorded" description="A control review records whether the control operated effectively, and schedules the next review." />
              ) : (
                <ol className="flex flex-col">
                  {c.reviews.map((r) => (
                    <li key={r.id} className="border-b border-border py-3 last:border-0">
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="font-medium">{REVIEW_OUTCOME_LABELS[r.outcome]}</span>
                        <span className="text-muted-foreground">
                          by {r.reviewer.name} · <TimeAgo date={r.reviewedAt} timeZone={ctx.org.timezone} /> · next review {formatDateOnly(r.nextReviewDate.toISOString().slice(0, 10))}
                        </span>
                      </div>
                      <PlainText text={r.notes} className="mt-1 text-[13px]" />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "work" ? (
            <div className="flex flex-col gap-5">
              <section>
                <SectionTitle action={d.permissions.createTask && !archived ? <Link href={`${base}/tasks?create=1&controlId=${c.id}`} className="text-xs text-accent hover:underline">Create task</Link> : null}>
                  Tasks
                </SectionTitle>
                {d.tasks.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No tasks linked to this control.</p>
                ) : (
                  <ul>
                    {d.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 border-b border-border py-2 text-[13px] last:border-0">
                        <span className="mono w-16 text-muted-foreground">{taskKey(t.number)}</span>
                        <Link href={`${base}/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {t.title}
                        </Link>
                        <Status map={TASK_STATUS} value={t.status} text />
                        <span className="hidden sm:inline">
                          <Person name={t.assignee?.name} />
                        </span>
                        <DueDate date={t.dueDate} today={d.today} done={t.status === "DONE" || t.status === "CANCELED"} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <SectionTitle action={d.permissions.createRisk && !archived ? <Link href={`${base}/risks/new?controlId=${c.id}`} className="text-xs text-accent hover:underline">Create risk</Link> : null}>
                  Risks
                </SectionTitle>
                {d.risks.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No risks linked to this control.</p>
                ) : (
                  <ul>
                    {d.risks.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 border-b border-border py-2 text-[13px] last:border-0">
                        <span className="mono w-16 text-muted-foreground">{riskKey(r.number)}</span>
                        <Link href={`${base}/risks/${r.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {r.title}
                        </Link>
                        <Status map={SEVERITY} value={r.severity} text />
                        <Status map={RISK_STATUS} value={r.status} text />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}

          {tab === "activity" ? <ActivityFeed events={d.activity} links={activityLinks} timeZone={ctx.org.timezone} /> : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
          <Panel className="p-4">
            <MetaList
              items={[
                {
                  label: "Status",
                  value: archived ? (
                    <Status map={CONTROL_STATUS} value={c.status} text />
                  ) : (
                    <StatusEditor {...ids} status={c.status} reason={c.notApplicableReason} disabledReason={d.permissions.updateStatusReason} />
                  ),
                },
                ...(c.status === "NOT_APPLICABLE" && c.notApplicableReason
                  ? [{ label: "Justification", value: <PlainText text={c.notApplicableReason} className="text-xs" /> }]
                  : []),
                {
                  label: "Owner",
                  value:
                    d.permissions.manage && !archived ? (
                      <OwnerSelect {...ids} ownerId={c.ownerId} members={d.members} />
                    ) : (
                      <Person name={c.owner?.name} />
                    ),
                },
                { label: "Priority", value: <Status map={PRIORITY} value={c.priority} text /> },
                { label: "Review", value: REVIEW_FREQUENCY_LABELS[c.reviewFrequency] },
                {
                  label: "Next review",
                  value:
                    d.permissions.manage && !archived ? (
                      <div className="flex flex-col gap-1">
                        <DueDate date={c.nextReviewDate} today={d.today} />
                        <NextReviewEditor {...ids} nextReviewDate={c.nextReviewDate} />
                      </div>
                    ) : (
                      <DueDate date={c.nextReviewDate} today={d.today} />
                    ),
                },
                {
                  label: "Last reviewed",
                  value: c.lastReviewedAt ? <TimeAgo date={c.lastReviewedAt} timeZone={ctx.org.timezone} /> : <span className="text-faint-foreground">Never</span>,
                },
                {
                  label: "Criteria",
                  value:
                    d.requirements.length === 0 ? (
                      <span className="text-faint-foreground">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {d.requirements.map((r) => (
                          <span key={r.id} className={`mono rounded-sm border border-border px-1 text-[11px] ${r.inScope ? "" : "text-faint-foreground line-through"}`} title={r.title}>
                            {r.code}
                          </span>
                        ))}
                      </div>
                    ),
                },
                { label: "Domain", value: c.domain ?? <span className="text-faint-foreground">—</span> },
                { label: "Created", value: <span title={formatTimestamp(c.createdAt, ctx.org.timezone)}>{c.createdBy.name}</span> },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
