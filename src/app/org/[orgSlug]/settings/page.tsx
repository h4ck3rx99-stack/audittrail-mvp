import type { Metadata } from "next";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { getOrganization } from "@/features/organizations/server/service";
import { GeneralSettingsForm } from "@/features/organizations/components/settings-forms";
import { toDateOnlyOrNull } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettingsPage({ params }: PageProps<"/org/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const org = await getOrganization(ctx);
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(org.timezone)) timezones.unshift(org.timezone);
  if (!timezones.includes("UTC")) timezones.unshift("UTC");
  return (
    <GeneralSettingsForm
      orgSlug={ctx.org.slug}
      readOnly={!can(ctx, "org.updateSettings")}
      timezones={timezones}
      org={{
        name: org.name,
        legalName: org.legalName,
        website: org.website,
        industry: org.industry,
        employeeRange: org.employeeRange,
        description: org.description,
        timezone: org.timezone,
        auditType: org.auditType,
        targetAuditDate: toDateOnlyOrNull(org.targetAuditDate),
        observationStart: toDateOnlyOrNull(org.observationStart),
        observationEnd: toDateOnlyOrNull(org.observationEnd),
      }}
    />
  );
}
