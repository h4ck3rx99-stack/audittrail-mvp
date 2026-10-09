"use client";

import * as React from "react";
import { SubmitButton, useActionForm } from "@/components/app/actions";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  adoptFrameworkAction,
  updateEvidencePolicyAction,
  updateOrganizationAction,
  updateScopeAction,
} from "../actions";
import { AUDIT_TYPES, AUDIT_TYPE_LABELS, EMPLOYEE_RANGES, EMPLOYEE_RANGE_LABELS } from "../schemas";

type Org = {
  name: string;
  legalName: string | null;
  website: string | null;
  industry: string | null;
  employeeRange: string;
  description: string | null;
  timezone: string;
  auditType: string;
  targetAuditDate: string | null;
  observationStart: string | null;
  observationEnd: string | null;
};

export function GeneralSettingsForm({
  orgSlug,
  org,
  timezones,
  readOnly,
}: {
  orgSlug: string;
  org: Org;
  timezones: string[];
  readOnly: boolean;
}) {
  const { formAction, fieldErrors } = useActionForm(updateOrganizationAction.bind(null, orgSlug), {
    success: "Organization updated",
  });
  const [auditType, setAuditType] = React.useState(org.auditType);
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="st-name" errors={fieldErrors?.name}>
              <Input name="name" defaultValue={org.name} maxLength={100} />
            </Field>
            <Field label="Legal name" htmlFor="st-legal" errors={fieldErrors?.legalName} optional>
              <Input name="legalName" defaultValue={org.legalName ?? ""} maxLength={200} />
            </Field>
            <Field label="Website" htmlFor="st-website" errors={fieldErrors?.website} optional>
              <Input
                name="website"
                type="url"
                defaultValue={org.website ?? ""}
                maxLength={2048}
                placeholder="https://"
              />
            </Field>
            <Field label="Industry" htmlFor="st-industry" errors={fieldErrors?.industry} optional>
              <Input name="industry" defaultValue={org.industry ?? ""} maxLength={100} />
            </Field>
            <Field label="Employees" htmlFor="st-size" errors={fieldErrors?.employeeRange}>
              <Select name="employeeRange" defaultValue={org.employeeRange}>
                {EMPLOYEE_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {EMPLOYEE_RANGE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Timezone"
              htmlFor="st-tz"
              errors={fieldErrors?.timezone}
              hint="Used for due dates, “today” and audit log timestamps."
            >
              <Select name="timezone" defaultValue={org.timezone}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="st-desc" errors={fieldErrors?.description} optional>
            <Textarea name="description" defaultValue={org.description ?? ""} maxLength={500} />
          </Field>
        </section>
        <section className="border-border flex flex-col gap-4 border-t pt-4">
          <h2 className="text-sm font-semibold">Audit planning</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audit type" htmlFor="st-audit" errors={fieldErrors?.auditType}>
              <Select
                name="auditType"
                value={auditType}
                onChange={(e) => setAuditType(e.target.value)}
              >
                {AUDIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AUDIT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Target audit date"
              htmlFor="st-target"
              errors={fieldErrors?.targetAuditDate}
              optional
            >
              <Input name="targetAuditDate" type="date" defaultValue={org.targetAuditDate ?? ""} />
            </Field>
            {auditType === "TYPE_2" ? (
              <>
                <Field
                  label="Observation start"
                  htmlFor="st-obs-start"
                  errors={fieldErrors?.observationStart}
                  optional
                >
                  <Input
                    name="observationStart"
                    type="date"
                    defaultValue={org.observationStart ?? ""}
                  />
                </Field>
                <Field
                  label="Observation end"
                  htmlFor="st-obs-end"
                  errors={fieldErrors?.observationEnd}
                  optional
                >
                  <Input
                    name="observationEnd"
                    type="date"
                    defaultValue={org.observationEnd ?? ""}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </section>
      </fieldset>
      {!readOnly ? (
        <SubmitButton className="self-start">Save changes</SubmitButton>
      ) : (
        <p className="text-muted-foreground text-[13px]">
          Only Owners and Admins can change organization settings.
        </p>
      )}
    </form>
  );
}

export function EvidencePolicyForm({
  orgSlug,
  requireIndependentEvidenceReview,
  defaultEvidenceValidityDays,
  readOnly,
}: {
  orgSlug: string;
  requireIndependentEvidenceReview: boolean;
  defaultEvidenceValidityDays: number;
  readOnly: boolean;
}) {
  const { formAction, fieldErrors } = useActionForm(
    updateEvidencePolicyAction.bind(null, orgSlug),
    { success: "Evidence policy updated" },
  );
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <fieldset disabled={readOnly} className="flex flex-col gap-5">
        <label className="flex items-start gap-3 text-[13px]">
          <Checkbox
            name="requireIndependentEvidenceReview"
            defaultChecked={requireIndependentEvidenceReview}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Require independent evidence review</span>
            <span className="text-muted-foreground mt-0.5 block">
              A person cannot approve or reject an evidence version they uploaded (segregation of
              duties). Recommended; auditors look for it. Changes to this setting are recorded in
              the audit log.
            </span>
          </span>
        </label>
        <Field
          label="Default evidence validity (days)"
          htmlFor="ep-days"
          errors={fieldErrors?.defaultEvidenceValidityDays}
          hint="Used on approval when evidence is not linked to a requirement and no explicit date is set."
        >
          <Input
            name="defaultEvidenceValidityDays"
            type="number"
            min={1}
            max={1825}
            defaultValue={defaultEvidenceValidityDays}
            className="w-32"
          />
        </Field>
      </fieldset>
      {!readOnly ? (
        <SubmitButton className="self-start">Save policy</SubmitButton>
      ) : (
        <p className="text-muted-foreground text-[13px]">
          Only Owners and Admins can change the evidence policy.
        </p>
      )}
    </form>
  );
}

type Category = { code: string; title: string; summary: string; isScopeRequired: boolean };

export function ScopeForm({
  orgSlug,
  frameworkKey,
  categories,
  inScope,
  readOnly,
}: {
  orgSlug: string;
  frameworkKey: string;
  categories: Category[];
  inScope: string[];
  readOnly: boolean;
}) {
  const { formAction } = useActionForm(updateScopeAction.bind(null, orgSlug, frameworkKey), {
    success: "Scope updated",
  });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset disabled={readOnly} className="flex flex-col gap-2">
        {categories.map((c) => (
          <label
            key={c.code}
            className="border-border flex items-start gap-2.5 rounded-sm border p-3 text-[13px]"
          >
            <Checkbox
              name="scopeCodes"
              value={c.code}
              defaultChecked={inScope.includes(c.code) || c.isScopeRequired}
              disabled={c.isScopeRequired}
              className="mt-0.5"
            />
            {c.isScopeRequired ? <input type="hidden" name="scopeCodes" value={c.code} /> : null}
            <span>
              <span className="font-medium">{c.title}</span>
              {c.isScopeRequired ? (
                <span className="text-muted-foreground ml-2 text-xs">Required</span>
              ) : null}
              <span className="text-muted-foreground mt-0.5 block text-xs">{c.summary}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-xs">
        Changing scope never deletes controls. Mappings to out-of-scope categories simply stop
        counting toward readiness.
      </p>
      {!readOnly ? <SubmitButton className="self-start">Save scope</SubmitButton> : null}
    </form>
  );
}

export function AdoptFrameworkForm({
  orgSlug,
  frameworkKey,
  categories,
  templateCount,
}: {
  orgSlug: string;
  frameworkKey: string;
  categories: Category[];
  templateCount: number;
}) {
  const { formAction } = useActionForm(adoptFrameworkAction.bind(null, orgSlug), {
    success: (d) => `Framework adopted · ${d.controlsCreated} controls created`,
  });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="frameworkKey" value={frameworkKey} />
      {categories.map((c) => (
        <label
          key={c.code}
          className="border-border flex items-start gap-2.5 rounded-sm border p-3 text-[13px]"
        >
          <Checkbox
            name="scopeCodes"
            value={c.code}
            defaultChecked={c.isScopeRequired}
            disabled={c.isScopeRequired}
            className="mt-0.5"
          />
          {c.isScopeRequired ? <input type="hidden" name="scopeCodes" value={c.code} /> : null}
          <span>
            <span className="font-medium">{c.title}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{c.summary}</span>
          </span>
        </label>
      ))}
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox name="starter" defaultChecked />
        Create the starter control set ({templateCount} controls). Safe to re-run: existing template
        controls are never duplicated.
      </label>
      <SubmitButton className="self-start">Adopt framework</SubmitButton>
    </form>
  );
}
