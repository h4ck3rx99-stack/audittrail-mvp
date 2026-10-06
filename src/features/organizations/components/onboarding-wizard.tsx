"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { checkSlugAction, createOrganizationAction } from "../actions";
import { AUDIT_TYPES, AUDIT_TYPE_LABELS, EMPLOYEE_RANGES, EMPLOYEE_RANGE_LABELS, slugify } from "../schemas";

type Framework = {
  key: string;
  name: string;
  description: string;
  requirementLabel: string;
  templateCount: number;
  categories: { code: string; title: string; summary: string; isScopeRequired: boolean }[];
};

const STEPS = ["Organization", "Framework and scope", "Starting point"] as const;

export function OnboardingWizard({ frameworks, timezone }: { frameworks: Framework[]; timezone: string }) {
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugCheck, setSlugCheck] = React.useState<{ slug: string; available: boolean; reason?: string } | null>(null);
  const [industry, setIndustry] = React.useState("");
  const [employeeRange, setEmployeeRange] = React.useState<(typeof EMPLOYEE_RANGES)[number]>("R11_50");
  const [description, setDescription] = React.useState("");
  const framework = frameworks[0];
  const [scope, setScope] = React.useState<Set<string>>(new Set(framework?.categories.filter((c) => c.isScopeRequired).map((c) => c.code)));
  const [auditType, setAuditType] = React.useState<(typeof AUDIT_TYPES)[number]>("UNDECIDED");
  const [targetAuditDate, setTargetAuditDate] = React.useState("");
  const [observationStart, setObservationStart] = React.useState("");
  const [observationEnd, setObservationEnd] = React.useState("");
  const [starter, setStarter] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, start] = React.useTransition();

  const effectiveSlug = slugTouched ? slug : slugify(name);

  React.useEffect(() => {
    if (effectiveSlug.length < 3) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      checkSlugAction(effectiveSlug).then((r) => {
        if (!cancelled) setSlugCheck(r.ok ? { slug: effectiveSlug, ...r.data } : { slug: effectiveSlug, available: false, reason: r.error.message });
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [effectiveSlug]);
  const current = slugCheck?.slug === effectiveSlug ? slugCheck : null;
  const slugState = { checking: effectiveSlug.length >= 3 && !current, available: current?.available, reason: current?.reason };

  if (!framework) return <p className="text-[13px] text-danger">No frameworks are available. Run the catalog sync first.</p>;

  const canContinue = step === 0 ? name.trim().length >= 2 && slugState.available === true : true;

  const submit = () =>
    start(async () => {
      setErrors({});
      const r = await createOrganizationAction({
        name,
        slug: effectiveSlug,
        industry,
        employeeRange,
        description,
        frameworkKey: framework.key,
        scopeCodes: [...scope],
        starter,
        // Default the organization timezone to the creator's browser timezone (editable in Settings).
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || timezone,
        auditType,
        targetAuditDate,
        observationStart: auditType === "TYPE_2" ? observationStart : "",
        observationEnd: auditType === "TYPE_2" ? observationEnd : "",
      });
      if (r && !r.ok) {
        setErrors(r.error.fieldErrors ?? {});
        toast.error(r.error.message);
        if (r.error.fieldErrors?.slug || r.error.fieldErrors?.name) setStep(0);
      }
    });

  return (
    <div>
      <ol className="mb-6 flex gap-4 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i === step ? "font-medium text-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
            <span className={cn("flex size-5 items-center justify-center rounded-full border text-[11px]", i <= step ? "border-accent text-accent" : "border-border")}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="rounded-md border border-border bg-surface p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <Field label="Organization name" htmlFor="ob-name" errors={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            </Field>
            <Field
              label="URL"
              htmlFor="ob-slug"
              errors={errors.slug ?? (slugState.available === false && slugState.reason ? [slugState.reason] : undefined)}
              hint={slugState.checking ? "Checking availability…" : slugState.available ? `Available: /org/${effectiveSlug}` : "Lowercase letters, numbers and hyphens."}
            >
              <Input
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                maxLength={48}
                className="mono"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Industry" htmlFor="ob-industry" errors={errors.industry} optional>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={100} placeholder="e.g. B2B SaaS" />
              </Field>
              <Field label="Employees" htmlFor="ob-size" errors={errors.employeeRange}>
                <Select value={employeeRange} onChange={(e) => setEmployeeRange(e.target.value as (typeof EMPLOYEE_RANGES)[number])}>
                  {EMPLOYEE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {EMPLOYEE_RANGE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Short description" htmlFor="ob-desc" errors={errors.description} optional hint="What your product does. Helps reviewers understand the system in scope.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold">{framework.name}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{framework.description}</p>
            </div>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Categories in scope</legend>
              <div className="flex flex-col gap-2">
                {framework.categories.map((c) => (
                  <label key={c.code} className={cn("flex items-start gap-2.5 rounded-sm border border-border p-3 text-[13px]", c.isScopeRequired ? "opacity-90" : "cursor-pointer hover:bg-hover")}>
                    <Checkbox
                      className="mt-0.5"
                      checked={scope.has(c.code)}
                      disabled={c.isScopeRequired}
                      onChange={() =>
                        setScope((s) => {
                          const n = new Set(s);
                          if (n.has(c.code)) n.delete(c.code);
                          else n.add(c.code);
                          return n;
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">{c.title}</span>
                      {c.isScopeRequired ? <span className="ml-2 text-xs text-muted-foreground">Required</span> : null}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{c.summary}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audit type" htmlFor="ob-audit" hint="Type I tests design at a point in time; Type II tests operation over a period.">
                <Select value={auditType} onChange={(e) => setAuditType(e.target.value as (typeof AUDIT_TYPES)[number])}>
                  {AUDIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {AUDIT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Target audit date" htmlFor="ob-target" errors={errors.targetAuditDate} optional>
                <Input type="date" value={targetAuditDate} onChange={(e) => setTargetAuditDate(e.target.value)} />
              </Field>
            </div>
            {auditType === "TYPE_2" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Observation period start" htmlFor="ob-obs-start" errors={errors.observationStart} optional>
                  <Input type="date" value={observationStart} onChange={(e) => setObservationStart(e.target.value)} />
                </Field>
                <Field label="Observation period end" htmlFor="ob-obs-end" errors={errors.observationEnd} optional>
                  <Input type="date" value={observationEnd} onChange={(e) => setObservationEnd(e.target.value)} />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-medium">How do you want to start?</legend>
            {[
              {
                value: true,
                title: `Start with the ${framework.name} starter control set (recommended)`,
                detail: `${framework.templateCount} original controls with evidence requirements and criteria mappings. Controls start unassigned so you can see ownership gaps immediately.`,
              },
              { value: false, title: "Start empty", detail: "Create your own controls and map them to criteria yourself." },
            ].map((o) => (
              <label key={String(o.value)} className={cn("flex cursor-pointer items-start gap-2.5 rounded-sm border p-3 text-[13px]", starter === o.value ? "border-accent bg-accent-subtle" : "border-border hover:bg-hover")}>
                <input type="radio" name="starter" className="mt-1 accent-[var(--accent)]" checked={starter === o.value} onChange={() => setStarter(o.value)} />
                <span>
                  <span className="font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{o.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="mt-6 flex justify-between">
          <Button type="button" variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" variant="primary" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {pending ? "Creating workspace…" : "Create workspace"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
