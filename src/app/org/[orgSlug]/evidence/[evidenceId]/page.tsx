import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { env } from "@/env";
import { requireOrgContext } from "@/server/authz/context";
import { getEvidenceDetail } from "@/features/evidence/server/queries";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { ACCEPT_ATTRIBUTE } from "@/server/files/detect";
import { ActivityFeed } from "@/components/app/activity-feed";
import { MetaList, PageHeader, Panel, Person, PlainText, SectionTitle, TimeAgo } from "@/components/app/primitives";
import { EVIDENCE_STATUS, FRESHNESS, Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { AddLinkForm, DeleteEvidenceButton, EditEvidenceButton, ReviewPanel } from "@/features/evidence/components/evidence-forms";
import { NewVersionForm } from "@/features/evidence/components/upload-form";
import { UnlinkButton } from "@/features/controls/components/control-forms";
import { EVIDENCE_CATEGORY_LABELS } from "@/features/evidence/schemas";
import { addDays, formatDateOnly } from "@/lib/dates";
import { formatBytes } from "@/lib/utils";

export const metadata: Metadata = { title: "Evidence" };

export default async function EvidenceDetailPage({ params }: PageProps<"/org/[orgSlug]/evidence/[evidenceId]">) {
  const { orgSlug, evidenceId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const d = await getEvidenceDetail(ctx, evidenceId);
  const e = d.evidence;
  const base = `/org/${ctx.org.slug}`;
  const api = `/api/org/${ctx.org.slug}/evidence/${e.id}/versions`;
  const links = await resolveResourceLinks(ctx, d.activity);
  const freshnessDays = e.controlLinks.map((l) => l.evidenceRequirement?.freshnessDays).filter((n): n is number => typeof n === "number");
  const suggestedValidUntil = e.validUntil ?? addDays(e.collectedAt, freshnessDays.length ? Math.min(...freshnessDays) : ctx.org.defaultEvidenceValidityDays);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-2 text-xs text-muted-foreground">
        <Link href={`${base}/evidence`} className="hover:underline">
          Evidence
        </Link>{" "}
        / {e.title}
      </div>
      <PageHeader
        title={e.title}
        meta={
          <>
            <Status map={EVIDENCE_STATUS} value={e.status} />
            {e.status === "APPROVED" ? <Status map={FRESHNESS} value={d.freshness} /> : null}
            <span>{EVIDENCE_CATEGORY_LABELS[e.category]}</span>
            <span>{e.kind === "LINK" ? "Link" : `Version ${e.currentVersion?.versionNumber ?? 1}`}</span>
          </>
        }
        actions={
          <>
            {e.kind === "FILE" && e.currentVersion ? (
              <Button asChild size="sm">
                <a href={`${api}/${e.currentVersion.id}/download`}>
                  <Download />
                  Download
                </a>
              </Button>
            ) : null}
            {e.kind === "LINK" && e.url ? (
              <Button asChild size="sm">
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink />
                  Open link
                </a>
              </Button>
            ) : null}
            {d.permissions.edit ? (
              <EditEvidenceButton
                orgSlug={ctx.org.slug}
                evidence={{ id: e.id, title: e.title, description: e.description, category: e.category, collectedAt: e.collectedAt, validUntil: e.validUntil, kind: e.kind, url: e.url }}
              />
            ) : null}
            {d.permissions.contribute ? (
              <DeleteEvidenceButton orgSlug={ctx.org.slug} evidenceId={e.id} title={e.title} disabledReason={d.permissions.editReason} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {d.previewImage && e.currentVersion ? (
            <Panel className="overflow-hidden p-2">
              <Image
                src={`${api}/${e.currentVersion.id}/download?inline=1`}
                alt={`Preview of ${e.title}`}
                width={1200}
                height={800}
                unoptimized
                className="h-auto max-h-[480px] w-auto max-w-full rounded-sm object-contain"
              />
            </Panel>
          ) : e.kind === "FILE" ? (
            <Panel className="p-4 text-[13px] text-muted-foreground">
              Preview is available for images only. Download the file to view it; downloads are recorded in the audit log.
            </Panel>
          ) : null}

          <section>
            <SectionTitle>Description</SectionTitle>
            <PlainText text={e.description} className="text-[13px]" />
            {e.kind === "LINK" && e.url ? (
              <p className="mono mt-2 break-all text-muted-foreground">{e.url}</p>
            ) : null}
          </section>

          <section>
            <SectionTitle>Supports</SectionTitle>
            {e.controlLinks.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Not linked to any control. Unlinked evidence does not count toward readiness.</p>
            ) : (
              <ul className="rounded-md border border-border">
                {e.controlLinks.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-0">
                    <Link href={`${base}/controls/${l.control.id}?tab=evidence`} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="mono mr-1.5 text-muted-foreground">{l.control.code}</span>
                      {l.evidenceRequirement ? l.evidenceRequirement.title : l.control.name}
                    </Link>
                    {!l.evidenceRequirement ? <span className="text-xs text-muted-foreground">Control only</span> : null}
                    {d.permissions.contribute && !l.control.archivedAt ? <UnlinkButton orgSlug={ctx.org.slug} linkId={l.id} label={e.title} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {d.permissions.contribute ? (
              <div className="mt-3 max-w-md">
                <AddLinkForm orgSlug={ctx.org.slug} evidenceId={e.id} controls={d.controls} />
              </div>
            ) : null}
          </section>

          {e.kind === "FILE" ? (
            <section>
              <SectionTitle>Versions</SectionTitle>
              <ul className="rounded-md border border-border">
                {e.versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-0">
                    <span className="mono w-8 text-muted-foreground">v{v.versionNumber}</span>
                    <span className="min-w-0 flex-1 truncate">{v.originalFilename}</span>
                    <span className="mono text-muted-foreground">{formatBytes(v.sizeBytes)}</span>
                    <span className="mono hidden text-muted-foreground md:inline" title={`SHA-256 ${v.sha256}`}>
                      {v.sha256.slice(0, 12)}…
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.uploadedBy.name} · <TimeAgo date={v.createdAt} timeZone={ctx.org.timezone} />
                    </span>
                    <a href={`${api}/${v.id}/download`} className="text-xs text-accent hover:underline">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
              {d.permissions.contribute ? (
                <div className="mt-3 max-w-md rounded-md border border-border p-4">
                  <p className="mb-2 text-[13px] font-medium">Upload a new version</p>
                  <NewVersionForm orgSlug={ctx.org.slug} evidenceId={e.id} maxMb={env.MAX_UPLOAD_MB} accept={ACCEPT_ATTRIBUTE} today={e.collectedAt > d.today ? e.collectedAt : d.today} />
                </div>
              ) : null}
            </section>
          ) : null}

          <section>
            <SectionTitle>Activity</SectionTitle>
            <ActivityFeed events={d.activity} links={links} timeZone={ctx.org.timezone} />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
          <Panel className="p-4">
            <SectionTitle>Review</SectionTitle>
            {e.status === "PENDING_REVIEW" ? (
              d.permissions.review ? (
                <ReviewPanel orgSlug={ctx.org.slug} evidenceId={e.id} suggestedValidUntil={formatDateOnly(suggestedValidUntil)} />
              ) : (
                <p className="text-[13px] text-muted-foreground">{d.permissions.reviewReason ?? "Waiting for an Owner or Admin to review."}</p>
              )
            ) : (
              <div className="text-[13px]">
                <p>
                  {e.status === "APPROVED" ? "Approved" : "Rejected"} by {e.reviewedBy?.name ?? "—"}
                  {e.reviewedAt ? (
                    <>
                      {" "}
                      · <TimeAgo date={e.reviewedAt} timeZone={ctx.org.timezone} />
                    </>
                  ) : null}
                </p>
                {e.reviewComment ? <PlainText text={e.reviewComment} className="mt-1 text-muted-foreground" /> : null}
                {e.status === "REJECTED" && d.permissions.contribute && e.kind === "FILE" ? (
                  <p className="mt-2 text-xs text-muted-foreground">Upload a corrected version to start a new review.</p>
                ) : null}
              </div>
            )}
          </Panel>
          <Panel className="p-4">
            <MetaList
              items={[
                { label: "Uploaded by", value: <Person name={e.uploadedBy.name} /> },
                { label: "Collected", value: formatDateOnly(e.collectedAt) },
                { label: "Valid until", value: e.validUntil ? formatDateOnly(e.validUntil) : <span className="text-faint-foreground">Set on approval</span> },
                { label: "Category", value: EVIDENCE_CATEGORY_LABELS[e.category] },
                { label: "Source", value: e.source === "MANUAL" ? "Manual" : "Integration" },
                ...(e.currentVersion
                  ? [
                      { label: "File", value: <span className="break-all">{e.currentVersion.originalFilename}</span> },
                      { label: "Size", value: <span className="mono">{formatBytes(e.currentVersion.sizeBytes)}</span> },
                      { label: "SHA-256", value: <span className="mono break-all text-muted-foreground">{e.currentVersion.sha256}</span> },
                    ]
                  : []),
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
